#include "sync_manager.hpp"

#include <algorithm>
#include <chrono>
#include <climits>
#include <fstream>
#include <filesystem>
#include <sstream>
#include <vector>

#include "ui_text_sync.hpp"
#include "window_manager.hpp"

namespace {
std::filesystem::path GetNativeSyncLogPath() {
  return std::filesystem::current_path() / "output" / "logs" / "window-sync-native.log";
}

void AppendNativeSyncLog(const std::string& message) {
  try {
    const auto path = GetNativeSyncLogPath();
    std::filesystem::create_directories(path.parent_path());
    std::ofstream stream(path, std::ios::app);
    if (!stream.is_open()) return;

    const auto now = std::chrono::system_clock::now();
    const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    stream << "[" << ms << "] " << message << "\n";
  } catch (...) {
  }
}

std::string HwndToString(HWND hwnd) {
  std::ostringstream oss;
  oss << "0x" << std::hex << reinterpret_cast<uintptr_t>(hwnd);
  return oss.str();
}

std::string NarrowString(const std::wstring& value) {
  return std::string(value.begin(), value.end());
}

std::wstring GetClassNameSafe(HWND hwnd) {
  if (!hwnd) return L"";
  wchar_t className[256] = {0};
  const int len = ::GetClassNameW(hwnd, className, 255);
  return len > 0 ? std::wstring(className, className + len) : L"";
}

RECT GetWindowRectSafe(HWND hwnd) {
  RECT rect{0, 0, 0, 0};
  if (!hwnd || !::GetWindowRect(hwnd, &rect)) {
    rect.left = rect.top = rect.right = rect.bottom = 0;
  }
  return rect;
}

int WidthOf(const RECT& rect) {
  return rect.right - rect.left;
}

int HeightOf(const RECT& rect) {
  return rect.bottom - rect.top;
}

std::string RectToString(const RECT& rect) {
  std::ostringstream oss;
  oss << rect.left << "," << rect.top << "," << rect.right << "," << rect.bottom
      << " " << WidthOf(rect) << "x" << HeightOf(rect);
  return oss.str();
}

std::string WindowDebugString(HWND hwnd) {
  if (!hwnd) return "null";

  DWORD pid = 0;
  ::GetWindowThreadProcessId(hwnd, &pid);
  RECT rect = GetWindowRectSafe(hwnd);
  std::ostringstream oss;
  oss << HwndToString(hwnd)
      << " pid=" << pid
      << " class=" << NarrowString(GetClassNameSafe(hwnd))
      << " visible=" << (::IsWindowVisible(hwnd) ? "1" : "0")
      << " rect=" << RectToString(rect);
  return oss.str();
}

std::string LParamPointToString(LPARAM value) {
  POINTS pt = MAKEPOINTS(value);
  return std::to_string(static_cast<int>(pt.x)) + "," + std::to_string(static_cast<int>(pt.y));
}

bool IsPointInside(const RECT& rect, const POINT& pt) {
  return pt.x >= rect.left && pt.x <= rect.right && pt.y >= rect.top && pt.y <= rect.bottom;
}

bool IsChromeWidgetWindow(HWND hwnd) {
  const std::wstring className = GetClassNameSafe(hwnd);
  return className.find(L"Chrome_WidgetWin_") != std::wstring::npos ||
         className.find(L"Edge_WidgetWin_") != std::wstring::npos;
}

int ClampInt(int value, int minValue, int maxValue) {
  return (std::max)(minValue, (std::min)(value, maxValue));
}

struct TopLevelPeerSearch {
  HWND sourceRoot;
  HWND mainRoot;
  HWND mirrorRoot;
  RECT sourceRect;
  RECT mainRect;
  RECT mirrorRect;
  POINT sourcePoint;
  HWND bestHwnd = nullptr;
  RECT bestRect{0, 0, 0, 0};
  int bestScore = INT_MAX;
};

BOOL CALLBACK EnumTopLevelPeerProc(HWND hwnd, LPARAM lParam) {
  auto* search = reinterpret_cast<TopLevelPeerSearch*>(lParam);
  if (!search || !hwnd) return TRUE;
  if (hwnd == search->sourceRoot || hwnd == search->mainRoot || hwnd == search->mirrorRoot) return TRUE;
  if (!::IsWindowVisible(hwnd) || !IsChromeWidgetWindow(hwnd)) return TRUE;

  RECT rect = GetWindowRectSafe(hwnd);
  const int width = WidthOf(rect);
  const int height = HeightOf(rect);
  const int sourceWidth = WidthOf(search->sourceRect);
  const int sourceHeight = HeightOf(search->sourceRect);
  if (width <= 20 || height <= 20 || sourceWidth <= 20 || sourceHeight <= 20) return TRUE;

  const int widthDiff = std::abs(width - sourceWidth);
  const int heightDiff = std::abs(height - sourceHeight);
  const int widthTolerance = (std::max)(80, sourceWidth / 3);
  const int heightTolerance = (std::max)(80, sourceHeight / 3);
  if (widthDiff > widthTolerance || heightDiff > heightTolerance) return TRUE;

  const int sourceCenterX = search->sourceRect.left + sourceWidth / 2;
  const int sourceCenterY = search->sourceRect.top + sourceHeight / 2;
  const int mainCenterX = search->mainRect.left + WidthOf(search->mainRect) / 2;
  const int mainCenterY = search->mainRect.top + HeightOf(search->mainRect) / 2;
  const int mirrorCenterX = search->mirrorRect.left + WidthOf(search->mirrorRect) / 2;
  const int mirrorCenterY = search->mirrorRect.top + HeightOf(search->mirrorRect) / 2;
  const int rectCenterX = rect.left + width / 2;
  const int rectCenterY = rect.top + height / 2;
  const int expectedCenterX = sourceCenterX + (mirrorCenterX - mainCenterX);
  const int expectedCenterY = sourceCenterY + (mirrorCenterY - mainCenterY);
  const int centerPenalty = (std::abs(rectCenterX - expectedCenterX) + std::abs(rectCenterY - expectedCenterY)) / 4;
  const int targetSidePenalty = std::abs(rectCenterX - mirrorCenterX) / 8;
  const int score = widthDiff * 3 + heightDiff * 3 + centerPenalty + targetSidePenalty;

  if (score < search->bestScore) {
    search->bestScore = score;
    search->bestHwnd = hwnd;
    search->bestRect = rect;
  }
  return TRUE;
}

HWND FindTopLevelPeerWindow(HWND sourceRoot, HWND mainRoot, HWND mirrorRoot,
    const RECT& sourceRect, const RECT& mirrorRect, POINT sourcePoint, POINT* mappedPoint) {
  TopLevelPeerSearch search{};
  search.sourceRoot = sourceRoot;
  search.mainRoot = mainRoot;
  search.mirrorRoot = mirrorRoot;
  search.sourceRect = sourceRect;
  search.mainRect = GetWindowRectSafe(mainRoot);
  search.mirrorRect = mirrorRect;
  search.sourcePoint = sourcePoint;
  ::EnumWindows(EnumTopLevelPeerProc, reinterpret_cast<LPARAM>(&search));

  if (!search.bestHwnd) return nullptr;

  const int sourceWidth = (std::max)(1, WidthOf(sourceRect));
  const int sourceHeight = (std::max)(1, HeightOf(sourceRect));
  const int targetWidth = (std::max)(1, WidthOf(search.bestRect));
  const int targetHeight = (std::max)(1, HeightOf(search.bestRect));
  const int localX = ClampInt(sourcePoint.x - sourceRect.left, 0, sourceWidth - 1);
  const int localY = ClampInt(sourcePoint.y - sourceRect.top, 0, sourceHeight - 1);
  mappedPoint->x = search.bestRect.left + (localX * targetWidth) / sourceWidth;
  mappedPoint->y = search.bestRect.top + (localY * targetHeight) / sourceHeight;

  AppendNativeSyncLog(
    "top-level-peer result=" + WindowDebugString(search.bestHwnd) +
    " sourceRect=" + RectToString(sourceRect) +
    " peerRect=" + RectToString(search.bestRect) +
    " sourcePt=" + std::to_string(sourcePoint.x) + "," + std::to_string(sourcePoint.y) +
    " mappedPt=" + std::to_string(mappedPoint->x) + "," + std::to_string(mappedPoint->y) +
    " score=" + std::to_string(search.bestScore));
  return search.bestHwnd;
}

DWORD BuildKeyboardModifierMask() {
  DWORD mask = 0;
  if (::GetAsyncKeyState(VK_CONTROL) & 0x8000) mask |= 1u << 0;
  if (::GetAsyncKeyState(VK_MENU) & 0x8000) mask |= 1u << 1;
  if ((::GetAsyncKeyState(VK_LWIN) & 0x8000) || (::GetAsyncKeyState(VK_RWIN) & 0x8000)) mask |= 1u << 2;
  return mask;
}

}

bool WindowSyncManager::Start(HWND mainHwnd, const std::vector<HWND>& mirrorHwnds) {
  if (!WindowManager::IsWindowValid(mainHwnd) || mirrorHwnds.empty()) return false;

  Stop();
  InitializeReplayWorker();
  if (!textSession_) {
    textSession_ = std::make_unique<TextSessionClassifier>();
  }
  textSession_->Reset();

  {
    std::lock_guard<std::mutex> lock(stateMutex_);
    mainHwnd_ = mainHwnd;
    mainRect_ = GetWindowRectSafe(mainHwnd_);
    mirrorLayouts_.clear();
    for (HWND hwnd : mirrorHwnds) {
      if (!WindowManager::IsWindowValid(hwnd)) continue;
      RECT rect = GetWindowRectSafe(hwnd);
      mirrorLayouts_.push_back({
        hwnd,
        rect.left - mainRect_.left,
        rect.top - mainRect_.top,
        WidthOf(rect) - WidthOf(mainRect_),
        HeightOf(rect) - HeightOf(mainRect_),
      });
    }
  }

  if (mirrorLayouts_.empty()) {
    mainHwnd_ = nullptr;
    ShutdownReplayWorker();
    return false;
  }

  threadReady_ = false;
  active_ = true;
  hookThread_ = std::thread(&WindowSyncManager::HookThreadMain);

  std::unique_lock<std::mutex> readyLock(readyMutex_);
  readyCv_.wait_for(readyLock, std::chrono::seconds(2), [] { return threadReady_.load(); });

  if (!threadReady_) {
    Stop();
    return false;
  }

  return true;
}

void WindowSyncManager::Stop() {
  if (!active_ && !hookThread_.joinable()) return;

  active_ = false;

  if (hookThreadId_ != 0) {
    ::PostThreadMessageW(hookThreadId_, WM_QUIT, 0, 0);
  }

  if (hookThread_.joinable()) {
    hookThread_.join();
  }

  ShutdownReplayWorker();

  {
    std::lock_guard<std::mutex> lock(stateMutex_);
    mainHwnd_ = nullptr;
    mainRect_ = RECT{0, 0, 0, 0};
    mirrorLayouts_.clear();
    if (textSession_) {
      textSession_->Reset();
    }
  }
}

bool WindowSyncManager::IsActive() {
  return active_.load();
}

NativeSyncState WindowSyncManager::GetState() {
  std::lock_guard<std::mutex> lock(stateMutex_);
  NativeSyncState state{};
  state.active = active_.load();
  state.mainHwnd = mainHwnd_;
  for (const auto& mirror : mirrorLayouts_) {
    state.mirrorHwnds.push_back(mirror.hwnd);
  }
  state.pendingTransactions = replayWorker_ ? replayWorker_->PendingCount() : 0;
  state.windowGroupCount = mainHwnd_ ? mirrorLayouts_.size() + 1 : 0;
  state.textSessionActive = textSession_ && textSession_->State() == TextSessionState::Active;
  return state;
}

void WindowSyncManager::HookThreadMain() {
  hookThreadId_ = ::GetCurrentThreadId();
  bool installed = InstallHooks();
  threadReady_ = true;
  readyCv_.notify_all();

  if (!installed) {
    active_ = false;
    hookThreadId_ = 0;
    return;
  }

  MSG msg;
  while (::GetMessageW(&msg, nullptr, 0, 0) > 0) {
    ::TranslateMessage(&msg);
    ::DispatchMessageW(&msg);
  }

  UninstallHooks();
  hookThreadId_ = 0;
}

bool WindowSyncManager::InstallHooks() {
  HMODULE moduleHandle = ::GetModuleHandleW(nullptr);
  mouseHook_ = ::SetWindowsHookExW(WH_MOUSE_LL, LowLevelMouseProc, moduleHandle, 0);
  keyboardHook_ = ::SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, moduleHandle, 0);

  foregroundHook_ = ::SetWinEventHook(
    EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr, WinEventProc, 0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  locationHook_ = ::SetWinEventHook(
    EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, nullptr, WinEventProc, 0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  minimizeStartHook_ = ::SetWinEventHook(
    EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZESTART, nullptr, WinEventProc, 0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
  minimizeEndHook_ = ::SetWinEventHook(
    EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZEEND, nullptr, WinEventProc, 0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);

  return mouseHook_ && keyboardHook_ && foregroundHook_ && locationHook_ && minimizeStartHook_ && minimizeEndHook_;
}

void WindowSyncManager::UninstallHooks() {
  if (mouseHook_) ::UnhookWindowsHookEx(mouseHook_);
  if (keyboardHook_) ::UnhookWindowsHookEx(keyboardHook_);
  if (foregroundHook_) ::UnhookWinEvent(foregroundHook_);
  if (locationHook_) ::UnhookWinEvent(locationHook_);
  if (minimizeStartHook_) ::UnhookWinEvent(minimizeStartHook_);
  if (minimizeEndHook_) ::UnhookWinEvent(minimizeEndHook_);

  mouseHook_ = nullptr;
  keyboardHook_ = nullptr;
  foregroundHook_ = nullptr;
  locationHook_ = nullptr;
  minimizeStartHook_ = nullptr;
  minimizeEndHook_ = nullptr;
}

void WindowSyncManager::InitializeReplayWorker() {
  if (!replayWorker_) {
    replayWorker_ = std::make_unique<InputReplayWorker>();
  }

  replayWorker_->Start([](const SyncTransaction& transaction) {
    HandleReplayTransaction(transaction);
  });
}

void WindowSyncManager::ShutdownReplayWorker() {
  if (!replayWorker_) return;
  replayWorker_->Stop();
}

void WindowSyncManager::HandleReplayTransaction(const SyncTransaction& transaction) {
  if (textSession_) {
    textSession_->Observe(transaction);
  }

  switch (transaction.type) {
    case SyncTransactionType::Mouse:
      ReplayMouseTransaction(transaction);
      break;
    case SyncTransactionType::Keyboard:
      ReplayKeyboardTransaction(transaction);
      if (TextSessionClassifier::IsTextTransaction(transaction)) {
        ReplayTextTransaction(transaction);
      }
      break;
    case SyncTransactionType::WindowState:
      ReplayWindowStateTransaction(transaction);
      break;
  }
}

uint64_t WindowSyncManager::NextTransactionSequence() {
  return ++transactionSequence_;
}

SyncTransaction WindowSyncManager::BuildMouseTransaction(WPARAM wParam, const MSLLHOOKSTRUCT* data) {
  const auto now = std::chrono::system_clock::now();
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

  SyncTransaction transaction{};
  transaction.type = SyncTransactionType::Mouse;
  transaction.sequence = NextTransactionSequence();
  transaction.timestampMs = static_cast<uint64_t>(ms);
  transaction.sourceRoot = data ? ResolveMainContextRoot(data->pt) : mainHwnd_;
  transaction.wParam = wParam;
  transaction.lParam = 0;
  transaction.screenPoint = data ? data->pt : POINT{0, 0};
  transaction.mouseData = data ? data->mouseData : 0;
  transaction.vkCode = 0;
  transaction.scanCode = 0;
  transaction.keyFlags = 0;
  return transaction;
}

SyncTransaction WindowSyncManager::BuildWindowStateTransaction(DWORD event, HWND hwnd) {
  const auto now = std::chrono::system_clock::now();
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

  SyncTransaction transaction{};
  transaction.type = SyncTransactionType::WindowState;
  transaction.sequence = NextTransactionSequence();
  transaction.timestampMs = static_cast<uint64_t>(ms);
  transaction.sourceRoot = mainHwnd_;
  transaction.eventHwnd = hwnd;
  transaction.wParam = static_cast<WPARAM>(event);
  transaction.lParam = reinterpret_cast<LPARAM>(hwnd);
  transaction.screenPoint = POINT{0, 0};
  transaction.mouseData = 0;
  transaction.vkCode = 0;
  transaction.scanCode = 0;
  transaction.keyFlags = 0;
  return transaction;
}

SyncTransaction WindowSyncManager::BuildKeyboardTransaction(WPARAM wParam, const KBDLLHOOKSTRUCT* data) {
  const auto now = std::chrono::system_clock::now();
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

  SyncTransaction transaction{};
  transaction.type = SyncTransactionType::Keyboard;
  transaction.sequence = NextTransactionSequence();
  transaction.timestampMs = static_cast<uint64_t>(ms);
  transaction.sourceRoot = mainHwnd_;
  transaction.wParam = wParam;
  transaction.lParam = 0;
  transaction.screenPoint = POINT{0, 0};
  transaction.mouseData = BuildKeyboardModifierMask();
  transaction.vkCode = data ? data->vkCode : 0;
  transaction.scanCode = data ? data->scanCode : 0;
  transaction.keyFlags = data ? data->flags : 0;
  return transaction;
}

void WindowSyncManager::RecalculateMirrorLayouts() {
  std::lock_guard<std::mutex> lock(stateMutex_);
  if (!mainHwnd_) return;
  mainRect_ = GetWindowRectSafe(mainHwnd_);
  for (auto& mirror : mirrorLayouts_) {
    RECT rect = GetWindowRectSafe(mirror.hwnd);
    mirror.offsetX = rect.left - mainRect_.left;
    mirror.offsetY = rect.top - mainRect_.top;
    mirror.widthDelta = WidthOf(rect) - WidthOf(mainRect_);
    mirror.heightDelta = HeightOf(rect) - HeightOf(mainRect_);
  }
}

void WindowSyncManager::MirrorWindowLayout() {
  if (!active_) return;

  std::lock_guard<std::mutex> lock(stateMutex_);
  if (!mainHwnd_) return;

  RECT currentMainRect = GetWindowRectSafe(mainHwnd_);
  if (WidthOf(currentMainRect) <= 0 || HeightOf(currentMainRect) <= 0) return;

  suppressEvents_ = true;
  for (const auto& mirror : mirrorLayouts_) {
    if (!WindowManager::IsWindowValid(mirror.hwnd)) continue;
    WindowManager::ShowWindowCmd(mirror.hwnd, "restore");
    WindowManager::SetWindowPosition(mirror.hwnd, {
      currentMainRect.left + mirror.offsetX,
      currentMainRect.top + mirror.offsetY,
      WidthOf(currentMainRect) + mirror.widthDelta,
      HeightOf(currentMainRect) + mirror.heightDelta,
    });
  }
  suppressEvents_ = false;
}

void WindowSyncManager::MirrorShowState() {
  if (!active_) return;

  std::lock_guard<std::mutex> lock(stateMutex_);
  if (!mainHwnd_) return;

  suppressEvents_ = true;
  const bool iconic = ::IsIconic(mainHwnd_) != FALSE;
  const bool zoomed = ::IsZoomed(mainHwnd_) != FALSE;

  for (const auto& mirror : mirrorLayouts_) {
    if (!WindowManager::IsWindowValid(mirror.hwnd)) continue;
    if (iconic) WindowManager::ShowWindowCmd(mirror.hwnd, "minimize");
    else if (zoomed) WindowManager::ShowWindowCmd(mirror.hwnd, "maximize");
    else WindowManager::ShowWindowCmd(mirror.hwnd, "restore");
  }
  suppressEvents_ = false;
}

HWND WindowSyncManager::GetRootWindow(HWND hwnd) {
  return hwnd ? ::GetAncestor(hwnd, GA_ROOT) : nullptr;
}

bool WindowSyncManager::IsDescendantOrSame(HWND root, HWND hwnd) {
  if (!root || !hwnd) return false;
  return root == hwnd || ::IsChild(root, hwnd);
}

HWND WindowSyncManager::ResolveMainContextRoot(const POINT& pt) {
  if (!active_) return false;

  std::lock_guard<std::mutex> lock(stateMutex_);
  if (!mainHwnd_) return nullptr;

  HWND foreground = GetRootWindow(::GetForegroundWindow());
  HWND pointed = ::WindowFromPoint(pt);
  HWND pointedRoot = GetRootWindow(pointed);

  AppendNativeSyncLog(
    "main-context-check pt=" + std::to_string(pt.x) + "," + std::to_string(pt.y) +
    " foreground=" + WindowDebugString(foreground) +
    " pointed=" + WindowDebugString(pointed) +
    " pointedRoot=" + WindowDebugString(pointedRoot) +
    " main=" + WindowDebugString(mainHwnd_));

  if (foreground == mainHwnd_) {
    if (pointed == nullptr || IsDescendantOrSame(mainHwnd_, pointed)) {
      AppendNativeSyncLog("main-context-result root-main result=" + WindowDebugString(mainHwnd_));
      return mainHwnd_;
    }
  }

  if (pointed == nullptr || IsDescendantOrSame(mainHwnd_, pointed)) {
    AppendNativeSyncLog("main-context-result pointed-main result=" + WindowDebugString(mainHwnd_));
    return mainHwnd_;
  }

  auto isKnownMirrorRoot = [](HWND hwnd) {
    for (const auto& mirror : mirrorLayouts_) {
      if (hwnd == mirror.hwnd) return true;
    }
    return false;
  };

  HWND candidate = nullptr;
  if (foreground && foreground != mainHwnd_ && !isKnownMirrorRoot(foreground) && IsChromeWidgetWindow(foreground)) {
    RECT rect = GetWindowRectSafe(foreground);
    if (IsPointInside(rect, pt)) {
      candidate = foreground;
    }
  }
  if (!candidate && pointedRoot && pointedRoot != mainHwnd_ && !isKnownMirrorRoot(pointedRoot) && IsChromeWidgetWindow(pointedRoot)) {
    RECT rect = GetWindowRectSafe(pointedRoot);
    if (IsPointInside(rect, pt)) {
      candidate = pointedRoot;
    }
  }
  if (candidate) {
    AppendNativeSyncLog("main-context-result coordinate-top-level result=" + WindowDebugString(candidate));
    return candidate;
  }

  AppendNativeSyncLog("main-context-result none");
  return nullptr;
}

bool WindowSyncManager::IsMainContext(const POINT& pt) {
  return ResolveMainContextRoot(pt) != nullptr;
}

HWND WindowSyncManager::ResolveTargetAtMappedPoint(HWND expectedRoot, POINT screenPoint, bool nonClient) {
  if (nonClient) {
    AppendNativeSyncLog(
      "target-resolve nonclient expectedRoot=" + WindowDebugString(expectedRoot) +
      " pt=" + std::to_string(screenPoint.x) + "," + std::to_string(screenPoint.y));
    return expectedRoot;
  }

  HWND target = ::WindowFromPoint(screenPoint);
  if (!target) {
    AppendNativeSyncLog(
      "target-resolve no-window expectedRoot=" + WindowDebugString(expectedRoot) +
      " pt=" + std::to_string(screenPoint.x) + "," + std::to_string(screenPoint.y));
    return expectedRoot;
  }

  HWND targetRoot = GetRootWindow(target);
  if (targetRoot == expectedRoot || IsDescendantOrSame(expectedRoot, target)) {
    AppendNativeSyncLog(
      "target-resolve inside-expected expectedRoot=" + WindowDebugString(expectedRoot) +
      " pt=" + std::to_string(screenPoint.x) + "," + std::to_string(screenPoint.y) +
      " target=" + WindowDebugString(target) +
      " targetRoot=" + WindowDebugString(targetRoot));
    return target;
  }

  // Some Chromium UI surfaces are top-level siblings, not children of the
  // browser root. Trust the mapped screen point first: the topmost Chromium
  // window at that point is the practical replay target for hover/click.
  if (targetRoot && IsChromeWidgetWindow(targetRoot)) {
    AppendNativeSyncLog(
      "target-resolve chromium-topmost expectedRoot=" + WindowDebugString(expectedRoot) +
      " pt=" + std::to_string(screenPoint.x) + "," + std::to_string(screenPoint.y) +
      " target=" + WindowDebugString(target) +
      " targetRoot=" + WindowDebugString(targetRoot));
    return target;
  }

  AppendNativeSyncLog(
    "target-resolve expected-root expectedRoot=" + WindowDebugString(expectedRoot) +
    " pt=" + std::to_string(screenPoint.x) + "," + std::to_string(screenPoint.y) +
    " target=" + WindowDebugString(target) +
    " targetRoot=" + WindowDebugString(targetRoot));
  return expectedRoot;
}

HWND WindowSyncManager::GetFocusedWindow(HWND rootWindow) {
  if (!rootWindow) return nullptr;

  DWORD threadId = ::GetWindowThreadProcessId(rootWindow, nullptr);
  GUITHREADINFO gui{sizeof(GUITHREADINFO)};
  if (::GetGUIThreadInfo(threadId, &gui)) {
    if (gui.hwndCaret && IsDescendantOrSame(rootWindow, gui.hwndCaret)) {
      return gui.hwndCaret;
    }
    if (gui.hwndFocus && IsDescendantOrSame(rootWindow, gui.hwndFocus)) {
      return gui.hwndFocus;
    }
  }

  return rootWindow;
}

LPARAM WindowSyncManager::BuildMouseLParam(HWND target, POINT screenPoint) {
  POINT clientPoint = screenPoint;
  ::ScreenToClient(target, &clientPoint);
  return MAKELPARAM(clientPoint.x, clientPoint.y);
}

WPARAM WindowSyncManager::BuildMouseKeyFlags() {
  WPARAM flags = 0;
  if (::GetAsyncKeyState(VK_LBUTTON) & 0x8000) flags |= MK_LBUTTON;
  if (::GetAsyncKeyState(VK_RBUTTON) & 0x8000) flags |= MK_RBUTTON;
  if (::GetAsyncKeyState(VK_MBUTTON) & 0x8000) flags |= MK_MBUTTON;
  if (::GetAsyncKeyState(VK_SHIFT) & 0x8000) flags |= MK_SHIFT;
  if (::GetAsyncKeyState(VK_CONTROL) & 0x8000) flags |= MK_CONTROL;
  return flags;
}

LPARAM WindowSyncManager::BuildKeyLParam(const KBDLLHOOKSTRUCT* data, bool keyUp) {
  return BuildKeyLParam(data->scanCode, data->flags, keyUp);
}

LPARAM WindowSyncManager::BuildKeyLParam(DWORD scanCode, DWORD keyFlags, bool keyUp) {
  LPARAM value = 1 | (static_cast<LPARAM>(scanCode) << 16);
  if (keyFlags & LLKHF_EXTENDED) value |= (1 << 24);
  if (keyFlags & LLKHF_ALTDOWN) value |= (1 << 29);
  if (keyUp) value |= (1 << 30) | (1u << 31);
  return value;
}

void WindowSyncManager::ReplayMouseTransaction(const SyncTransaction& transaction) {
  if (!active_) return;

  std::lock_guard<std::mutex> lock(stateMutex_);
  if (!mainHwnd_) return;

  HWND sourceRoot = transaction.sourceRoot ? transaction.sourceRoot : mainHwnd_;
  if (!WindowManager::IsWindowValid(sourceRoot)) sourceRoot = mainHwnd_;

  RECT sourceRect = GetWindowRectSafe(sourceRoot);
  if (!IsPointInside(sourceRect, transaction.screenPoint)) return;

  const bool nonClient = ::SendMessageW(sourceRoot, WM_NCHITTEST, 0, MAKELPARAM(transaction.screenPoint.x, transaction.screenPoint.y)) != HTCLIENT;
  const int sourceWidth = (std::max)(1, WidthOf(sourceRect));
  const int sourceHeight = (std::max)(1, HeightOf(sourceRect));
  RECT mainRect = GetWindowRectSafe(mainHwnd_);
  const bool sourceIsMain = sourceRoot == mainHwnd_;

  for (const auto& mirror : mirrorLayouts_) {
    if (!WindowManager::IsWindowValid(mirror.hwnd)) continue;

    RECT mirrorBaseRect = GetWindowRectSafe(mirror.hwnd);
    const char* mappingMode = sourceIsMain ? "root-scale" : "top-level-translate";
    int mappedX = 0;
    int mappedY = 0;
    HWND topLevelPeer = nullptr;
    if (sourceIsMain) {
      mappedX = mirrorBaseRect.left + ((transaction.screenPoint.x - sourceRect.left) * (std::max)(1, WidthOf(mirrorBaseRect))) / sourceWidth;
      mappedY = mirrorBaseRect.top + ((transaction.screenPoint.y - sourceRect.top) * (std::max)(1, HeightOf(mirrorBaseRect))) / sourceHeight;
    } else {
      POINT peerMappedPoint{0, 0};
      topLevelPeer = FindTopLevelPeerWindow(sourceRoot, mainHwnd_, mirror.hwnd, sourceRect, mirrorBaseRect, transaction.screenPoint, &peerMappedPoint);
      if (topLevelPeer) {
        mappingMode = "top-level-peer";
        mappedX = peerMappedPoint.x;
        mappedY = peerMappedPoint.y;
      } else {
        mappedX = transaction.screenPoint.x + (mirrorBaseRect.left - mainRect.left);
        mappedY = transaction.screenPoint.y + (mirrorBaseRect.top - mainRect.top);
      }
    }
    POINT mappedPoint{mappedX, mappedY};

    HWND target = topLevelPeer ? topLevelPeer : ResolveTargetAtMappedPoint(mirror.hwnd, mappedPoint, nonClient);
    WPARAM mouseFlags = BuildMouseKeyFlags();

    AppendNativeSyncLog(
      "mouse-map msg=" + std::to_string(static_cast<unsigned long long>(transaction.wParam)) +
      " mappingMode=" + mappingMode +
      " sourceIsMain=" + std::string(sourceIsMain ? "1" : "0") +
      " mainRect=" + RectToString(mainRect) +
      " sourceRect=" + RectToString(sourceRect) +
      " sourcePt=" + std::to_string(transaction.screenPoint.x) + "," + std::to_string(transaction.screenPoint.y) +
      " mirrorBaseRect=" + RectToString(mirrorBaseRect) +
      " mappedPt=" + std::to_string(mappedPoint.x) + "," + std::to_string(mappedPoint.y) +
      " nonClient=" + std::string(nonClient ? "1" : "0"));

    AppendNativeSyncLog(
      "mouse-replay msg=" + std::to_string(static_cast<unsigned long long>(transaction.wParam)) +
      " sourceRoot=" + WindowDebugString(sourceRoot) +
      " sourcePt=" + std::to_string(transaction.screenPoint.x) + "," + std::to_string(transaction.screenPoint.y) +
      " mirrorBase=" + WindowDebugString(mirror.hwnd) +
      " mappedPt=" + std::to_string(mappedPoint.x) + "," + std::to_string(mappedPoint.y) +
      " target=" + WindowDebugString(target));

    if (nonClient) {
      LRESULT hitTest = ::SendMessageW(mirror.hwnd, WM_NCHITTEST, 0, MAKELPARAM(mappedPoint.x, mappedPoint.y));
      UINT ncMessage = 0;
      switch (transaction.wParam) {
        case WM_MOUSEMOVE: ncMessage = WM_NCMOUSEMOVE; break;
        case WM_LBUTTONDOWN: ncMessage = WM_NCLBUTTONDOWN; break;
        case WM_LBUTTONUP: ncMessage = WM_NCLBUTTONUP; break;
        case WM_LBUTTONDBLCLK: ncMessage = WM_NCLBUTTONDBLCLK; break;
        case WM_RBUTTONDOWN: ncMessage = WM_NCRBUTTONDOWN; break;
        case WM_RBUTTONUP: ncMessage = WM_NCRBUTTONUP; break;
        case WM_RBUTTONDBLCLK: ncMessage = WM_NCRBUTTONDBLCLK; break;
      }
      if (ncMessage != 0) {
        ::PostMessageW(mirror.hwnd, ncMessage, static_cast<WPARAM>(hitTest), MAKELPARAM(mappedPoint.x, mappedPoint.y));
      }
      continue;
    }

    UINT message = static_cast<UINT>(transaction.wParam);
    if (transaction.wParam == WM_MOUSEWHEEL || transaction.wParam == WM_MOUSEHWHEEL) {
      WPARAM wheelFlags = MAKEWPARAM(mouseFlags, HIWORD(transaction.mouseData));
      // Wheel messages carry screen coordinates in lParam, not client
      // coordinates. Chromium ignores some wheel replays when this is wrong.
      AppendNativeSyncLog(
        "mouse-post wheel target=" + WindowDebugString(target) +
        " wParam=" + std::to_string(static_cast<unsigned long long>(wheelFlags)) +
        " lParamScreen=" + std::to_string(mappedPoint.x) + "," + std::to_string(mappedPoint.y));
      ::PostMessageW(target, message, wheelFlags, MAKELPARAM(mappedPoint.x, mappedPoint.y));
      continue;
    }

    LPARAM mouseLParam = BuildMouseLParam(target, mappedPoint);
    if (transaction.wParam == WM_MOUSEMOVE) {
      AppendNativeSyncLog(
        "mouse-post hover-prime target=" + WindowDebugString(target) +
        " lParamClient=" + LParamPointToString(mouseLParam));
      ::PostMessageW(target, WM_SETCURSOR, reinterpret_cast<WPARAM>(target), MAKELPARAM(HTCLIENT, WM_MOUSEMOVE));
      ::PostMessageW(target, WM_NCMOUSEMOVE, HTCLIENT, MAKELPARAM(mappedPoint.x, mappedPoint.y));
    }

    AppendNativeSyncLog(
      "mouse-post target=" + WindowDebugString(target) +
      " msg=" + std::to_string(static_cast<unsigned long long>(message)) +
      " wParam=" + std::to_string(static_cast<unsigned long long>(mouseFlags)) +
      " lParamClient=" + LParamPointToString(mouseLParam));
    ::PostMessageW(target, message, mouseFlags, mouseLParam);
  }
}

void WindowSyncManager::MirrorMouseEvent(WPARAM wParam, const MSLLHOOKSTRUCT* data) {
  ReplayMouseTransaction(BuildMouseTransaction(wParam, data));
}

void WindowSyncManager::ReplayKeyboardTransaction(const SyncTransaction& transaction) {
  if (!active_) return;

  std::lock_guard<std::mutex> lock(stateMutex_);
  if (!mainHwnd_) return;

  const bool keyUp = (transaction.wParam == WM_KEYUP || transaction.wParam == WM_SYSKEYUP);
  const UINT keyboardMessage = static_cast<UINT>(transaction.wParam);
  const LPARAM keyLParam = BuildKeyLParam(transaction.scanCode, transaction.keyFlags, keyUp);

  for (const auto& mirror : mirrorLayouts_) {
    if (!WindowManager::IsWindowValid(mirror.hwnd)) continue;

    HWND target = GetFocusedWindow(mirror.hwnd);
    if (!target) target = mirror.hwnd;

    ::PostMessageW(target, keyboardMessage, static_cast<WPARAM>(transaction.vkCode), keyLParam);
  }
}

void WindowSyncManager::ReplayTextTransaction(const SyncTransaction& transaction) {
  if (!active_) return;

  const bool keyDown = transaction.wParam == WM_KEYDOWN || transaction.wParam == WM_SYSKEYDOWN;
  if (!keyDown) return;

  // Keep this path read-only. UI Automation writes steal focus from Chromium.
  // Physical key replay above keeps the existing sync behavior alive while the
  // committed-text channel is implemented with a focus-neutral mechanism.
}

void WindowSyncManager::SyncFocusedTextToMirrors() {
  // Deprecated: focus-stealing UIA SetValue path intentionally disabled.
}

void WindowSyncManager::MirrorKeyboardEvent(WPARAM wParam, const KBDLLHOOKSTRUCT* data) {
  ReplayKeyboardTransaction(BuildKeyboardTransaction(wParam, data));
}

void WindowSyncManager::ReplayWindowStateTransaction(const SyncTransaction& transaction) {
  const DWORD event = static_cast<DWORD>(transaction.wParam);
  switch (event) {
    case EVENT_SYSTEM_MINIMIZESTART:
    case EVENT_SYSTEM_MINIMIZEEND:
      MirrorShowState();
      if (event == EVENT_SYSTEM_MINIMIZEEND) MirrorWindowLayout();
      break;
    case EVENT_OBJECT_LOCATIONCHANGE:
      MirrorShowState();
      if (!::IsIconic(mainHwnd_)) {
        MirrorWindowLayout();
      }
      break;
  }
}

LRESULT CALLBACK WindowSyncManager::LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode == HC_ACTION && active_) {
    auto* data = reinterpret_cast<MSLLHOOKSTRUCT*>(lParam);
    HWND contextRoot = data ? ResolveMainContextRoot(data->pt) : nullptr;
    if (data && !suppressEvents_ && data->dwExtraInfo != injectionTag_ && contextRoot) {
      AppendNativeSyncLog(
        "mouse-captured msg=" + std::to_string(static_cast<unsigned long long>(wParam)) +
        " pt=" + std::to_string(data->pt.x) + "," + std::to_string(data->pt.y) +
        " contextRoot=" + WindowDebugString(contextRoot));
      if (replayWorker_ && replayWorker_->IsRunning()) {
        replayWorker_->Enqueue(BuildMouseTransaction(wParam, data));
      } else {
        MirrorMouseEvent(wParam, data);
      }
    } else if (data && !suppressEvents_ && data->dwExtraInfo != injectionTag_) {
      AppendNativeSyncLog(
        "mouse-ignored msg=" + std::to_string(static_cast<unsigned long long>(wParam)) +
        " pt=" + std::to_string(data->pt.x) + "," + std::to_string(data->pt.y) +
        " foreground=" + WindowDebugString(GetRootWindow(::GetForegroundWindow())) +
        " pointed=" + WindowDebugString(::WindowFromPoint(data->pt)));
    }
  }

  return ::CallNextHookEx(mouseHook_, nCode, wParam, lParam);
}

LRESULT CALLBACK WindowSyncManager::LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode == HC_ACTION && active_) {
    auto* data = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
    HWND foreground = GetRootWindow(::GetForegroundWindow());
    if (data && !suppressEvents_ && data->dwExtraInfo != injectionTag_ && foreground == mainHwnd_) {
      if (replayWorker_ && replayWorker_->IsRunning()) {
        replayWorker_->Enqueue(BuildKeyboardTransaction(wParam, data));
      } else {
        MirrorKeyboardEvent(wParam, data);
      }
    }
  }

  return ::CallNextHookEx(keyboardHook_, nCode, wParam, lParam);
}

void CALLBACK WindowSyncManager::WinEventProc(HWINEVENTHOOK, DWORD event, HWND hwnd,
    LONG idObject, LONG idChild, DWORD, DWORD) {
  if (!active_ || suppressEvents_) return;
  if (idObject != OBJID_WINDOW || idChild != CHILDID_SELF) return;

  HWND root = GetRootWindow(hwnd);
  if (root != mainHwnd_) return;

  switch (event) {
    case EVENT_SYSTEM_FOREGROUND:
      break;
    case EVENT_SYSTEM_MINIMIZESTART:
    case EVENT_SYSTEM_MINIMIZEEND:
      if (replayWorker_ && replayWorker_->IsRunning()) {
        replayWorker_->Enqueue(BuildWindowStateTransaction(event, hwnd));
      } else {
        ReplayWindowStateTransaction(BuildWindowStateTransaction(event, hwnd));
      }
      break;
    case EVENT_OBJECT_LOCATIONCHANGE:
      if (replayWorker_ && replayWorker_->IsRunning()) {
        replayWorker_->Enqueue(BuildWindowStateTransaction(event, hwnd));
      } else {
        ReplayWindowStateTransaction(BuildWindowStateTransaction(event, hwnd));
      }
      break;
  }
}

Napi::Value WindowSyncManager::StartSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsArray()) {
    Napi::TypeError::New(env, "Expected (mainHwnd: number, mirrorHwnds: number[])").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  HWND mainHwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(info[0].As<Napi::Number>().Int64Value()));
  Napi::Array arr = info[1].As<Napi::Array>();
  std::vector<HWND> mirrors;
  for (uint32_t i = 0; i < arr.Length(); i++) {
    mirrors.push_back(reinterpret_cast<HWND>(static_cast<intptr_t>(arr.Get(i).As<Napi::Number>().Int64Value())));
  }

  return Napi::Boolean::New(env, Start(mainHwnd, mirrors));
}

Napi::Value WindowSyncManager::StopSync(const Napi::CallbackInfo& info) {
  Stop();
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value WindowSyncManager::GetSyncState(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  NativeSyncState state = GetState();

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("active", state.active);
  obj.Set("mainHwnd", state.mainHwnd ? static_cast<double>(reinterpret_cast<intptr_t>(state.mainHwnd)) : 0);
  obj.Set("pendingTransactions", static_cast<double>(state.pendingTransactions));
  obj.Set("windowGroupCount", static_cast<double>(state.windowGroupCount));
  obj.Set("textSessionActive", state.textSessionActive);
  Napi::Array mirrors = Napi::Array::New(env, state.mirrorHwnds.size());
  for (size_t i = 0; i < state.mirrorHwnds.size(); i++) {
    mirrors.Set(i, static_cast<double>(reinterpret_cast<intptr_t>(state.mirrorHwnds[i])));
  }
  obj.Set("mirrorHwnds", mirrors);
  return obj;
}
