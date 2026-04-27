#pragma once

#include "sync_types.hpp"

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>

class InputReplayWorker {
public:
  using ReplayCallback = std::function<void(const SyncTransaction&)>;

  bool Start(ReplayCallback callback);
  void Stop();
  bool Enqueue(const SyncTransaction& transaction);
  bool IsRunning() const;
  size_t PendingCount() const;

private:
  void ThreadMain();

  mutable std::mutex mutex_;
  std::condition_variable cv_;
  std::deque<SyncTransaction> queue_;
  std::thread workerThread_;
  ReplayCallback callback_;
  std::atomic<bool> running_{false};
};
