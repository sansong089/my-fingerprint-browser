// 取消 winspool.h 的 EnumMonitors 宏（打印监视器），我们要用的是显示器的 EnumDisplayMonitors
#ifdef EnumMonitors
#undef EnumMonitors
#endif

#include "monitor_manager.hpp"

// ============================================================
// MonitorManager 实现
// ============================================================

std::vector<Win32MonitorInfo> MonitorManager::GetAllMonitors() {
  std::vector<Win32MonitorInfo> monitors;
  ::EnumDisplayMonitors(NULL, NULL, MonitorEnumProc, reinterpret_cast<LPARAM>(&monitors));
  return monitors;
}

BOOL CALLBACK MonitorManager::MonitorEnumProc(HMONITOR hMonitor, HDC hdc, LPRECT rect, LPARAM lParam) {
  auto* monitors = reinterpret_cast<std::vector<Win32MonitorInfo>*>(lParam);

  MONITORINFOEXW mi = {};
  mi.cbSize = sizeof(MONITORINFOEXW);
  GetMonitorInfoW(hMonitor, &mi);

  Win32MonitorInfo info;

  // deviceName: 宽字符 → UTF-8
  int len = WideCharToMultiByte(CP_UTF8, 0, mi.szDevice, -1,
                                 NULL, 0, NULL, NULL);
  std::string utf8(len - 1, '\0');
  WideCharToMultiByte(CP_UTF8, 0, mi.szDevice, -1,
                      &utf8[0], len, NULL, NULL);
  info.deviceName = utf8;

  info.isPrimary = (mi.dwFlags & MONITORINFOF_PRIMARY) != 0;
  info.boundsX = mi.rcMonitor.left;
  info.boundsY = mi.rcMonitor.top;
  info.boundsW = mi.rcMonitor.right - mi.rcMonitor.left;
  info.boundsH = mi.rcMonitor.bottom - mi.rcMonitor.top;
  info.workX = mi.rcWork.left;
  info.workY = mi.rcWork.top;
  info.workW = mi.rcWork.right - mi.rcWork.left;
  info.workH = mi.rcWork.bottom - mi.rcWork.top;

  monitors->push_back(info);
  return TRUE;
}

std::vector<Win32WindowPosition> MonitorManager::CalculateGridLayout(
    int count,
    const Win32MonitorInfo* targetMonitor) {

  // 默认使用主显示器工作区
  Win32MonitorInfo selectedMonitorCopy;
  if (!targetMonitor) {
    auto all = GetAllMonitors();
    for (const auto& m : all) {
      if (m.isPrimary) { selectedMonitorCopy = m; targetMonitor = &selectedMonitorCopy; break; }
    }
    if (!targetMonitor && !all.empty()) { selectedMonitorCopy = all[0]; targetMonitor = &selectedMonitorCopy; }
  }

  if (count <= 0 || !targetMonitor) return {};

  // 计算网格列数（优先横向排列）
  int cols = static_cast<int>(std::ceil(std::sqrt(count)));
  int rows = (count + cols - 1) / cols;

  int cellW = targetMonitor->workW / cols;
  int cellH = targetMonitor->workH / rows;
  int originX = targetMonitor->workX;
  int originY = targetMonitor->workY;

  std::vector<Win32WindowPosition> positions;
  for (int i = 0; i < count; i++) {
    int col = i % cols;
    int row = i / cols;
    Win32WindowPosition pos;
    pos.x = originX + col * cellW;
    pos.y = originY + row * cellH;
    pos.width = cellW;
    pos.height = cellH;
    positions.push_back(pos);
  }
  return positions;
}

bool MonitorManager::ArrangeWindows(
    const std::vector<HWND>& hwnds,
    const std::vector<Win32WindowPosition>& positions) {

  if (hwnds.size() != positions.size()) return false;

  bool allOk = true;
  for (size_t i = 0; i < hwnds.size(); i++) {
    if (!WindowManager::SetWindowPosition(hwnds[i], positions[i])) {
      allOk = false;
    }
  }
  return allOk;
}

// ============================================================
// N-API 绑定：MonitorManager
// ============================================================

Napi::Value MonitorManager::GetMonitors(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  auto monitors = GetAllMonitors();
  Napi::Array arr = Napi::Array::New(env, monitors.size());
  for (size_t i = 0; i < monitors.size(); i++) {
    arr.Set(i, monitors[i].ToNapiObject(env));
  }
  return arr;
}

Napi::Value MonitorManager::ArrangeWindows(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // 参数：(hwnds: number[], positions?: {x,y,w,h}[])
  // 如果不传 positions，自动使用目标显示器的网格布局

  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "Expected hwnds array as first argument")
        .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  Napi::Array hwndsArr = info[0].As<Napi::Array>();
  std::vector<HWND> hwnds;
  for (uint32_t i = 0; i < hwndsArr.Length(); i++) {
    HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(
        hwndsArr.Get(i).As<Napi::Number>().Int64Value()));
    hwnds.push_back(hwnd);
  }

  std::vector<Win32WindowPosition> positions;

  if (info.Length() >= 2 && info[1].IsArray()) {
    // 使用传入的位置数组
    Napi::Array posArr = info[1].As<Napi::Array>();
    for (uint32_t i = 0; i < posArr.Length(); i++) {
      Napi::Object p = posArr.Get(i).As<Napi::Object>();
      Win32WindowPosition pos;
      pos.x = p.Get("x").As<Napi::Number>().Int32Value();
      pos.y = p.Get("y").As<Napi::Number>().Int32Value();
      pos.width = p.Get("width").As<Napi::Number>().Int32Value();
      pos.height = p.Get("height").As<Napi::Number>().Int32Value();
      positions.push_back(pos);
    }
  } else {
    // 自动网格排列 — 在主显示器上
    positions = CalculateGridLayout(static_cast<int>(hwnds.size()));
  }

  bool ok = ArrangeWindows(hwnds, positions);
  return Napi::Boolean::New(env, ok);
}
