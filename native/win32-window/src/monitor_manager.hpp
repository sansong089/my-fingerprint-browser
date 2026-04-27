#pragma once

#include <napi.h>
#include <windows.h>
#include <vector>

#include "window_manager.hpp"

// ============================================================
// MonitorManager — 多显示器枚举与窗口排列
// ============================================================

class MonitorManager {
public:
  /** 枚举所有显示器 */
  static std::vector<Win32MonitorInfo> GetAllMonitors();

  /** 将多个窗口排列到指定位置（网格布局） */
  static bool ArrangeWindows(
      const std::vector<HWND>& hwnds,
      const std::vector<Win32WindowPosition>& positions);

  /** 按网格自动排列（指定目标显示器或主显示器） */
  static std::vector<Win32WindowPosition> CalculateGridLayout(
      int count,
      const Win32MonitorInfo* targetMonitor = nullptr);

  // --- N-API 绑定 ---

  static Napi::Value GetMonitors(const Napi::CallbackInfo& info);
  static Napi::Value ArrangeWindows(const Napi::CallbackInfo& info);

private:
  struct ArrangeContext {
    const std::vector<HWND>* hwnds;
    const std::vector<Win32WindowPosition>* positions;
    bool success;
    size_t index;
  };

  static BOOL CALLBACK MonitorEnumProc(HMONITOR hMonitor, HDC hdc, LPRECT rect, LPARAM lParam);
};
