#pragma once

#include "sync_types.hpp"

#include <chrono>
#include <mutex>

enum class TextSessionState {
  Idle,
  Active,
};

class TextSessionClassifier {
public:
  void Reset();
  TextSessionState Observe(const SyncTransaction& transaction);
  TextSessionState State() const;
  static bool IsTextTransaction(const SyncTransaction& transaction);

private:
  static bool IsTextLikeKey(const SyncTransaction& transaction);
  static bool IsSessionTerminator(const SyncTransaction& transaction);

  mutable std::mutex mutex_;
  TextSessionState state_{TextSessionState::Idle};
  std::chrono::steady_clock::time_point lastInputAt_{};
};
