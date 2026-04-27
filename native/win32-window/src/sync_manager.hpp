#pragma once

#include "input_replay.hpp"
#include "text_session.hpp"
#include <napi.h>
#include <windows.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

struct NativeSyncState {
  bool active;
  HWND mainHwnd;
  std::vector<HWND> mirrorHwnds;
  size_t pendingTransactions;
  size_t windowGroupCount;
  bool textSessionActive;
};

class WindowSyncManager {
public:
  static bool Start(HWND mainHwnd, const std::vector<HWND>& mirrorHwnds);
  static void Stop();
  static bool IsActive();
  static NativeSyncState GetState();

  static Napi::Value StartSync(const Napi::CallbackInfo& info);
  static Napi::Value StopSync(const Napi::CallbackInfo& info);
  static Napi::Value GetSyncState(const Napi::CallbackInfo& info);

private:
  struct MirrorLayout {
    HWND hwnd;
    int offsetX;
    int offsetY;
    int widthDelta;
    int heightDelta;
  };

  static void HookThreadMain();
  static bool InstallHooks();
  static void UninstallHooks();
  static void RecalculateMirrorLayouts();
  static void MirrorWindowLayout();
  static void MirrorShowState();
  static void MirrorMouseEvent(WPARAM wParam, const MSLLHOOKSTRUCT* data);
  static void MirrorKeyboardEvent(WPARAM wParam, const KBDLLHOOKSTRUCT* data);
  static void ReplayMouseTransaction(const SyncTransaction& transaction);
  static void ReplayKeyboardTransaction(const SyncTransaction& transaction);
  static void ReplayWindowStateTransaction(const SyncTransaction& transaction);
  static void ReplayTextTransaction(const SyncTransaction& transaction);
  static void SyncFocusedTextToMirrors();
  static void InitializeReplayWorker();
  static void ShutdownReplayWorker();
  static void HandleReplayTransaction(const SyncTransaction& transaction);
  static uint64_t NextTransactionSequence();
  static SyncTransaction BuildMouseTransaction(WPARAM wParam, const MSLLHOOKSTRUCT* data);
  static SyncTransaction BuildKeyboardTransaction(WPARAM wParam, const KBDLLHOOKSTRUCT* data);
  static SyncTransaction BuildWindowStateTransaction(DWORD event, HWND hwnd);

  static HWND GetRootWindow(HWND hwnd);
  static bool IsDescendantOrSame(HWND root, HWND hwnd);
  static HWND ResolveMainContextRoot(const POINT& pt);
  static bool IsMainContext(const POINT& pt);
  static HWND ResolveTargetAtMappedPoint(HWND expectedRoot, POINT screenPoint, bool nonClient);
  static HWND GetFocusedWindow(HWND rootWindow);
  static LPARAM BuildMouseLParam(HWND target, POINT screenPoint);
  static WPARAM BuildMouseKeyFlags();
  static LPARAM BuildKeyLParam(const KBDLLHOOKSTRUCT* data, bool keyUp);
  static LPARAM BuildKeyLParam(DWORD scanCode, DWORD keyFlags, bool keyUp);

  static LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam);
  static LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam);
  static void CALLBACK WinEventProc(HWINEVENTHOOK hook, DWORD event, HWND hwnd,
      LONG idObject, LONG idChild, DWORD eventThread, DWORD eventTime);

  static inline std::mutex stateMutex_;
  static inline std::mutex readyMutex_;
  static inline std::condition_variable readyCv_;
  static inline std::thread hookThread_;
  static inline std::atomic<bool> active_{false};
  static inline std::atomic<bool> suppressEvents_{false};
  static inline std::atomic<bool> threadReady_{false};
  static inline DWORD hookThreadId_ = 0;
  static inline HWND mainHwnd_ = nullptr;
  static inline RECT mainRect_{};
  static inline std::vector<MirrorLayout> mirrorLayouts_;
  static inline HHOOK mouseHook_ = nullptr;
  static inline HHOOK keyboardHook_ = nullptr;
  static inline HWINEVENTHOOK foregroundHook_ = nullptr;
  static inline HWINEVENTHOOK locationHook_ = nullptr;
  static inline HWINEVENTHOOK minimizeStartHook_ = nullptr;
  static inline HWINEVENTHOOK minimizeEndHook_ = nullptr;
  static inline std::unique_ptr<InputReplayWorker> replayWorker_;
  static inline std::unique_ptr<TextSessionClassifier> textSession_;
  static inline std::atomic<uint64_t> transactionSequence_{0};
  static inline ULONG_PTR injectionTag_ = 0x46504253594E434Cull;
};
