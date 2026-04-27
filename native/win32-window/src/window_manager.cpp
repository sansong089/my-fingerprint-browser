// 取消 Windows SDK 的 SetWindowPos 宏，避免与我们的方法名冲突
#ifdef SetWindowPos
#undef SetWindowPos
#endif

#include "window_manager.hpp"

// ============================================================
// Win32MonitorInfo → NAPI Object
// ============================================================

Napi::Object Win32MonitorInfo::ToNapiObject(Napi::Env env) const {
  auto obj = Napi::Object::New(env);
  obj.Set("id", deviceName);
  obj.Set("isPrimary", isPrimary);

  auto bounds = Napi::Object::New(env);
  bounds.Set("x", boundsX);
  bounds.Set("y", boundsY);
  bounds.Set("width", boundsW);
  bounds.Set("height", boundsH);
  obj.Set("bounds", bounds);

  auto workArea = Napi::Object::New(env);
  workArea.Set("x", workX);
  workArea.Set("y", workY);
  workArea.Set("width", workW);
  workArea.Set("height", workH);
  obj.Set("workArea", workArea);

  return obj;
}

// ============================================================
// WindowManager 实现
// ============================================================

// ============================================================
// 进程树辅助：收集目标进程及其所有子进程的 PID
// ============================================================

/**
 * 使用 CreateToolhelp32Snapshot 遍历进程树，
 * 收集 targetPid 及其所有后代子进程的 PID。
 * Chrome 多进程架构下，spawn 返回的是 Browser 主进程 PID，
 * 但窗口（Renderer/GPU 等）可能挂在子进程上。
 * 实际经验：Chrome 主窗口的 HWND 所属进程通常就是 Browser 主进程本身，
 * 但为了鲁棒性，我们同时匹配整棵进程树。
 */
static std::set<DWORD> collectProcessTree(DWORD targetPid) {
  std::set<DWORD> pids;
  if (targetPid == 0) return pids;

  // 第一轮：直接加入目标 PID
  pids.insert(targetPid);

  // 多轮 BFS：不断发现新的子进程，直到收敛
  // （因为子进程可能还有自己的子进程）
  bool changed = true;
  while (changed) {
    changed = false;
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) continue;

    PROCESSENTRY32W pe = {0};
    pe.dwSize = sizeof(PROCESSENTRY32W);
    if (Process32FirstW(snap, &pe)) {
      do {
        DWORD currentPid = pe.th32ProcessID;
        DWORD parentPid = pe.th32ParentProcessID;
        // 如果父进程已在集合中且当前进程不在 → 加入
        if (pids.count(parentPid) > 0 && pids.count(currentPid) == 0) {
          pids.insert(currentPid);
          changed = true;
        }
      } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
  }

  return pids;
}

std::vector<Win32WindowInfo> WindowManager::FindWindowsByPid(DWORD pid) {
  // 收集进程树所有 PID
  const std::set<DWORD> pidSet = collectProcessTree(pid);

  EnumContext ctx;
  ctx.targetPid = pid; // 保持兼容（虽然下面不再用 ctx.targetPid 做精确匹配）
  ::EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&ctx));

  // 过滤：只保留属于该进程树的窗口
  std::vector<Win32WindowInfo> filtered;
  for (const auto& w : ctx.results) {
    if (pidSet.count(w.pid) > 0) {
      filtered.push_back(w);
    }
  }
  return filtered;
}

BOOL CALLBACK WindowManager::EnumWindowsProc(HWND hwnd, LPARAM lParam) {
  auto* ctx = reinterpret_cast<EnumContext*>(lParam);

  // 只检查顶级窗口（跳过子窗口）
  HWND owner = GetWindow(hwnd, GW_OWNER);
  if (owner != NULL) return TRUE;

  DWORD windowPid = 0;
  GetWindowThreadProcessId(hwnd, &windowPid);

  // 获取窗口标题
  wchar_t title[512] = {0};
  GetWindowTextW(hwnd, title, sizeof(title) / sizeof(wchar_t));

  // 排除空标题和 "Program Manager"（桌面）
  if (wcslen(title) == 0 || wcscmp(title, L"Program Manager") == 0) return TRUE;

  // 验证进程名：只匹配 chrome.exe / msedge.exe（排除 Electron/VS Code 等 Chromium 内核应用）
  wchar_t imagePath[MAX_PATH] = {0};
  HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, windowPid);
  bool isTargetBrowser = false;
  if (hProcess) {
    DWORD bufSize = MAX_PATH;
    QueryFullProcessImageNameW(hProcess, 0, imagePath, &bufSize);
    CloseHandle(hProcess);

    const wchar_t* fileName = wcsrchr(imagePath, L'\\');
    if (fileName) fileName++;
    else fileName = imagePath;

    isTargetBrowser = (_wcsicmp(fileName, L"chrome.exe") == 0) ||
                      (_wcsicmp(fileName, L"msedge.exe") == 0);
  }
  if (!isTargetBrowser) return TRUE;

  Win32WindowInfo info;
  info.hwnd = hwnd;
  info.title = std::wstring(title);
  info.pid = windowPid;
  info.isVisible = !!IsWindowVisible(hwnd);
  ctx->results.push_back(info);

  // 不中断枚举 — 一个进程可能有多个窗口
  return TRUE;
}

bool WindowManager::SetWindowPosition(HWND hwnd, const Win32WindowPosition& pos) {
  if (!IsWindowValid(hwnd)) return FALSE;

  // SWP_NOZORDER | SWP_NOACTIVATE: 不改变 Z 序列，不激活
  BOOL result = ::SetWindowPos(
      hwnd,
      NULL,
      pos.x, pos.y,
      pos.width, pos.height,
      SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW);

  return result != FALSE;
}

bool WindowManager::ShowWindowCmd(HWND hwnd, const std::string& cmd) {
  if (!IsWindowValid(hwnd)) return false;

  int nCmdShow = SW_RESTORE; // default

  if (cmd == "maximize") {
    nCmdShow = SW_MAXIMIZE;
  } else if (cmd == "minimize") {
    nCmdShow = SW_MINIMIZE;
  } else if (cmd == "restore") {
    nCmdShow = SW_RESTORE;
  } else if (cmd == "show") {
    nCmdShow = SW_SHOW;
  } else if (cmd == "hide") {
    nCmdShow = SW_HIDE;
  }

  ::ShowWindow(hwnd, nCmdShow);
  return true;
}

bool WindowManager::IsWindowValid(HWND hwnd) {
  return ::IsWindow(hwnd) != FALSE;
}

std::unique_ptr<Win32WindowPosition> WindowManager::GetWindowPosition(HWND hwnd) {
  if (!IsWindowValid(hwnd)) return nullptr;

  RECT rect;
  if (::GetWindowRect(hwnd, &rect) == FALSE) return nullptr;

  auto pos = std::make_unique<Win32WindowPosition>();
  pos->x = rect.left;
  pos->y = rect.top;
  pos->width = rect.right - rect.left;
  pos->height = rect.bottom - rect.top;
  return pos;
}

bool WindowManager::FocusWindow(HWND hwnd) {
  if (!IsWindowValid(hwnd)) return false;

  // 先将窗口恢复（如果最小化了）
  ::ShowWindow(hwnd, SW_RESTORE);

  // 尝试使用 SetForegroundWindow 将窗口带到前台
  // 注意：系统可能有前台锁限制，这种情况下先用 SetActiveWindow
  if (!::SetForegroundWindow(hwnd)) {
    // 如果失败，尝试先激活再设置前台
    ::SetActiveWindow(hwnd);
    ::SetForegroundWindow(hwnd);
  }

  // 使用 SetWindowPos 确保窗口在 z-order 最顶层
  ::SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

  return true;
}

// ============================================================
// N-API 绑定：WindowManager
// ============================================================

// --- 查找所有浏览器窗口的实现 ---
struct BrowserEnumCtx {
  std::vector<Win32WindowInfo> results;
};

BOOL CALLBACK WindowManager::BrowserEnumProc(HWND hwnd, LPARAM lParam) {
  auto* ctx = reinterpret_cast<BrowserEnumCtx*>(lParam);

  // 只看顶级窗口
  HWND owner = GetWindow(hwnd, GW_OWNER);
  if (owner != NULL) return TRUE;

  // 检查窗口类名 — Chrome 主窗口的类名是 Chrome_WidgetWin_1
  wchar_t className[256] = {0};
  GetClassNameW(hwnd, className, sizeof(className) / sizeof(wchar_t));

  // 匹配 Chrome / Edge / Chromium 类名
  bool isChromeClass = (wcsstr(className, L"Chrome_WidgetWin_") != nullptr) ||
                       (wcsstr(className, L"Edge_WidgetWin_") != nullptr);
  if (!isChromeClass) return TRUE;

  // 排除空标题
  wchar_t title[512] = {0};
  GetWindowTextW(hwnd, title, sizeof(title) / sizeof(wchar_t));
  if (wcslen(title) == 0 || wcscmp(title, L"Program Manager") == 0) return TRUE;

  // 获取 PID 并验证进程名为 chrome.exe 或 msedge.exe
  // 这一步至关重要：Electron/VS Code/Codex 等也用 Chrome_WidgetWin_1 类名
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (pid == 0) return TRUE;

  wchar_t imagePath[MAX_PATH] = {0};
  HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (hProcess) {
    DWORD bufSize = MAX_PATH;
    QueryFullProcessImageNameW(hProcess, 0, imagePath, &bufSize);
    CloseHandle(hProcess);
  }

  // 只匹配真正的 Chrome 或 Edge（不匹配 electron.exe、Code.exe 等）
  const wchar_t* fileName = wcsrchr(imagePath, L'\\');
  if (fileName) fileName++; // skip '\'
  else fileName = imagePath;

  bool isTargetBrowser = (_wcsicmp(fileName, L"chrome.exe") == 0) ||
                         (_wcsicmp(fileName, L"msedge.exe") == 0);
  if (!isTargetBrowser) return TRUE;

  Win32WindowInfo info;
  info.hwnd = hwnd;
  info.title = std::wstring(title);
  info.pid = pid;
  info.isVisible = !!IsWindowVisible(hwnd);
  ctx->results.push_back(info);
  return TRUE;
}

std::vector<Win32WindowInfo> WindowManager::FindAllBrowserWindows() {
  BrowserEnumCtx ctx;
  ::EnumWindows(BrowserEnumProc, reinterpret_cast<LPARAM>(&ctx));
  return ctx.results;
}

Napi::Value WindowManager::FindWindowByPid(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected numeric pid").ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD pid = static_cast<DWORD>(info[0].As<Napi::Number>().Int32Value());
  auto windows = FindWindowsByPid(pid);

  Napi::Array arr = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); i++) {
    auto item = Napi::Object::New(env);
    item.Set("hwnd", static_cast<double>(reinterpret_cast<intptr_t>(windows[i].hwnd)));

    // 宽字符标题转 UTF-8
    int len = WideCharToMultiByte(CP_UTF8, 0, windows[i].title.c_str(), -1,
                                   NULL, 0, NULL, NULL);
    std::string utf8(len - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, windows[i].title.c_str(), -1,
                        &utf8[0], len, NULL, NULL);
    item.Set("title", utf8);
    item.Set("pid", static_cast<double>(windows[i].pid));
    item.Set("isVisible", windows[i].isVisible);

    arr.Set(i, item);
  }
  return arr;
}

Napi::Value WindowManager::FindAllBrowserWindows(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto windows = FindAllBrowserWindows();

  Napi::Array arr = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); i++) {
    auto item = Napi::Object::New(env);
    item.Set("hwnd", static_cast<double>(reinterpret_cast<intptr_t>(windows[i].hwnd)));

    int len = WideCharToMultiByte(CP_UTF8, 0, windows[i].title.c_str(), -1,
                                   NULL, 0, NULL, NULL);
    std::string utf8(len - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, windows[i].title.c_str(), -1,
                        &utf8[0], len, NULL, NULL);
    item.Set("title", utf8);
    item.Set("pid", static_cast<double>(windows[i].pid));
    item.Set("isVisible", windows[i].isVisible);

    arr.Set(i, item);
  }
  return arr;
}

Napi::Value WindowManager::SetWindowPos(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected (hwnd: number, pos: {x,y,w,h})")
        .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(
      info[0].As<Napi::Number>().Int64Value()));
  Napi::Object posObj = info[1].As<Napi::Object>();

  Win32WindowPosition pos;
  pos.x = posObj.Get("x").As<Napi::Number>().Int32Value();
  pos.y = posObj.Get("y").As<Napi::Number>().Int32Value();
  pos.width = posObj.Get("width").As<Napi::Number>().Int32Value();
  pos.height = posObj.Get("height").As<Napi::Number>().Int32Value();

  bool ok = SetWindowPosition(hwnd, pos);
  return Napi::Boolean::New(env, ok);
}

Napi::Value WindowManager::ShowWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected (hwnd: number, cmd: string)")
        .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(
      info[0].As<Napi::Number>().Int64Value()));
  std::string cmd = info[1].As<Napi::String>().Utf8Value();

  bool ok = ShowWindowCmd(hwnd, cmd);
  return Napi::Boolean::New(env, ok);
}

Napi::Value WindowManager::IsWindowValid(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected numeric hwnd").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(
      info[0].As<Napi::Number>().Int64Value()));
  bool valid = IsWindowValid(hwnd);
  return Napi::Boolean::New(env, valid);
}

Napi::Value WindowManager::GetWindowPosition(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected numeric hwnd").ThrowAsJavaScriptException();
    return env.Null();
  }

  HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(
      info[0].As<Napi::Number>().Int64Value()));

  auto pos = GetWindowPosition(hwnd);
  if (!pos) return env.Null();

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("x", pos->x);
  obj.Set("y", pos->y);
  obj.Set("width", pos->width);
  obj.Set("height", pos->height);
  return obj;
}

Napi::Value WindowManager::Focus(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected numeric hwnd").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(
      info[0].As<Napi::Number>().Int64Value()));

  bool ok = FocusWindow(hwnd);
  return Napi::Boolean::New(env, ok);
}
