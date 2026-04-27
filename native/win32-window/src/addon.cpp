/**
 * win32-window — N-API Native Addon
 *
 * Windows 窗口控制 + 多显示器管理
 *
 * 导出方法：
 *   - findWindowByPid(pid: number) → WindowInfo[]
 *   - setWindowPosition(hwnd: number, pos: {x,y,w,h}) → boolean
 *   - showWindow(hwnd: number, cmd: string) → boolean  (maximize|minimize|restore|show|hide)
 *   - isWindowValid(hwnd: number) → boolean
 *   - getWindowPosition(hwnd: number) → {x,y,w,h} | null
 *   - getMonitors() → MonitorInfo[]
 *   - arrangeWindows(hwnds: number[], positions?: {x,y,w,h}[]) → boolean
 *
 * 属性：
 *   - isNativeLoaded = true（标识已加载原生模块）
 */

#include <napi.h>
#include "window_manager.hpp"
#include "monitor_manager.hpp"
#include "sync_manager.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // 标识：原生模块已加载
  exports.Set("isNativeLoaded", Napi::Boolean::New(env, true));

  // --- 窗口操作（lambda 避免与 Win32 API 重载名冲突） ---
  exports.Set("findWindowByPid",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::FindWindowByPid(info);
    }, "findWindowByPid"));

  exports.Set("findAllBrowserWindows",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::FindAllBrowserWindows(info);
    }, "findAllBrowserWindows"));

  exports.Set("setWindowPosition",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::SetWindowPos(info);
    }, "setWindowPosition"));

  exports.Set("showWindow",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::ShowWindow(info);
    }, "showWindow"));

  exports.Set("isWindowValid",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::IsWindowValid(info);
    }, "isWindowValid"));

  exports.Set("getWindowPosition",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::GetWindowPosition(info);
    }, "getWindowPosition"));

  exports.Set("focusWindow",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowManager::Focus(info);
    }, "focusWindow"));

  // --- 显示器操作 ---
  exports.Set("getMonitors",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return MonitorManager::GetMonitors(info);
    }, "getMonitors"));

  exports.Set("arrangeWindows",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return MonitorManager::ArrangeWindows(info);
    }, "arrangeWindows"));

  exports.Set("startWindowSync",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowSyncManager::StartSync(info);
    }, "startWindowSync"));

  exports.Set("stopWindowSync",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowSyncManager::StopSync(info);
    }, "stopWindowSync"));

  exports.Set("getWindowSyncState",
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
      return WindowSyncManager::GetSyncState(info);
    }, "getWindowSyncState"));

  return exports;
}

NODE_API_MODULE(win32_window, Init)
