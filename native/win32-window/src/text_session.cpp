#include "text_session.hpp"

namespace {
constexpr auto kSessionIdleTimeout = std::chrono::milliseconds(1200);
constexpr DWORD kModifierCtrl = 1u << 0;
constexpr DWORD kModifierAlt = 1u << 1;
constexpr DWORD kModifierWin = 1u << 2;
}

void TextSessionClassifier::Reset() {
  std::lock_guard<std::mutex> lock(mutex_);
  state_ = TextSessionState::Idle;
  lastInputAt_ = {};
}

TextSessionState TextSessionClassifier::Observe(const SyncTransaction& transaction) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (transaction.type != SyncTransactionType::Keyboard) return state_;

  const auto now = std::chrono::steady_clock::now();
  if (state_ == TextSessionState::Active && lastInputAt_ != std::chrono::steady_clock::time_point{} &&
      now - lastInputAt_ > kSessionIdleTimeout) {
    state_ = TextSessionState::Idle;
  }

  if (IsSessionTerminator(transaction)) {
    state_ = TextSessionState::Idle;
    lastInputAt_ = now;
    return state_;
  }

  if (IsTextLikeKey(transaction)) {
    state_ = TextSessionState::Active;
    lastInputAt_ = now;
  }

  return state_;
}

TextSessionState TextSessionClassifier::State() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return state_;
}

bool TextSessionClassifier::IsTextTransaction(const SyncTransaction& transaction) {
  return IsTextLikeKey(transaction);
}

bool TextSessionClassifier::IsTextLikeKey(const SyncTransaction& transaction) {
  const bool keyDown = transaction.wParam == WM_KEYDOWN || transaction.wParam == WM_SYSKEYDOWN;
  if (!keyDown) return false;

  const DWORD vk = transaction.vkCode;
  const bool commandModifier = (transaction.mouseData & (kModifierCtrl | kModifierAlt | kModifierWin)) != 0;
  if (commandModifier) return false;

  if (vk >= 'A' && vk <= 'Z') return true;
  if (vk >= '0' && vk <= '9') return true;
  if (vk >= VK_NUMPAD0 && vk <= VK_NUMPAD9) return true;

  switch (vk) {
    case VK_SPACE:
    case VK_BACK:
    case VK_RETURN:
    case VK_OEM_1:
    case VK_OEM_PLUS:
    case VK_OEM_COMMA:
    case VK_OEM_MINUS:
    case VK_OEM_PERIOD:
    case VK_OEM_2:
    case VK_OEM_3:
    case VK_OEM_4:
    case VK_OEM_5:
    case VK_OEM_6:
    case VK_OEM_7:
      return true;
  }

  return false;
}

bool TextSessionClassifier::IsSessionTerminator(const SyncTransaction& transaction) {
  const bool keyDown = transaction.wParam == WM_KEYDOWN || transaction.wParam == WM_SYSKEYDOWN;
  if (!keyDown) return false;

  switch (transaction.vkCode) {
    case VK_ESCAPE:
    case VK_TAB:
      return true;
  }

  return false;
}
