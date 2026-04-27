#pragma once

#include <windows.h>

#include <cstdint>

enum class SyncTransactionType {
  Mouse,
  Keyboard,
  WindowState,
};

struct SyncTransaction {
  SyncTransactionType type;
  uint64_t sequence;
  uint64_t timestampMs;
  HWND sourceRoot;
  HWND eventHwnd;
  WPARAM wParam;
  LPARAM lParam;
  POINT screenPoint;
  DWORD mouseData;
  DWORD vkCode;
  DWORD scanCode;
  DWORD keyFlags;
};
