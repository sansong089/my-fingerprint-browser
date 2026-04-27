#pragma once

#include <napi.h>
#include <windows.h>
#include <tlhelp32.h>
#include <vector>
#include <string>
#include <set>

/**
 * WindowInfo: 窗口查找结果
 */
struct Win32WindowInfo {
  HWND hwnd;
  std::wstring title;
  DWORD pid;
  bool isVisible;  // 窗口是否可见（非最小化）
};

/**
 * WindowPosition: 窗口位置/尺寸
 */
struct Win32WindowPosition {
  int x, y, width, height;
};

/**
 * MonitorInfo: 显示器信息
 */
struct Win32MonitorInfo {
  std::string deviceName;
  bool isPrimary;
  int boundsX, boundsY, boundsW, boundsH;
  int workX, workY, workW, workH;

  Napi::Object ToNapiObject(Napi::Env env) const;
};

// ============================================================
// WindowManager — 单窗口操作
// ============================================================

class WindowManager {
public:
  /** 通过 PID 查找所有顶级窗口 */
  static std::vector<Win32WindowInfo> FindWindowsByPid(DWORD pid);

  /** 查找所有浏览器窗口（按进程名 chrome.exe + 窗口类名） */
  static std::vector<Win32WindowInfo> FindAllBrowserWindows();

  /** 设置窗口位置和大小 */
  static bool SetWindowPosition(HWND hwnd, const Win32WindowPosition& pos);

  /** 控制窗口显示状态（maximize/minimize/restore/show/hide） */
  static bool ShowWindowCmd(HWND hwnd, const std::string& cmd);

  /** 检查窗口句柄是否有效 */
  static bool IsWindowValid(HWND hwnd);

  /** 获取窗口位置 */
  static std::unique_ptr<Win32WindowPosition> GetWindowPosition(HWND hwnd);

  /** 将窗口带到前台（设置 z-order 为最顶层） */
  static bool FocusWindow(HWND hwnd);

  // --- N-API 绑定 ---

  static Napi::Value FindWindowByPid(const Napi::CallbackInfo& info);
  static Napi::Value FindAllBrowserWindows(const Napi::CallbackInfo& info);
  static Napi::Value SetWindowPos(const Napi::CallbackInfo& info);
  static Napi::Value ShowWindow(const Napi::CallbackInfo& info);
  static Napi::Value IsWindowValid(const Napi::CallbackInfo& info);
  static Napi::Value GetWindowPosition(const Napi::CallbackInfo& info);
  static Napi::Value Focus(const Napi::CallbackInfo& info);

private:
  // EnumWindows 回调上下文
  struct EnumContext {
    DWORD targetPid;
    std::vector<Win32WindowInfo> results;
  };

  static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam);
  static BOOL CALLBACK BrowserEnumProc(HWND hwnd, LPARAM lParam);
};
