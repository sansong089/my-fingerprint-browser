#pragma once

#include <windows.h>

#include <optional>
#include <string>

struct UiTextSnapshot {
  std::wstring text;
  RECT boundingRect;
  bool hasBoundingRect;
};

class UiTextSync {
public:
  static std::optional<UiTextSnapshot> ReadFocusedTextSnapshot(HWND expectedRoot);
  static std::optional<std::wstring> ReadFocusedText(HWND expectedRoot);
  static bool ReplaceTextInWindow(HWND rootHwnd, const UiTextSnapshot& snapshot, HWND sourceRoot);
  static bool ReplaceTextInWindow(HWND rootHwnd, const std::wstring& text);
};
