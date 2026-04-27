#include "input_replay.hpp"

#include <utility>

bool InputReplayWorker::Start(ReplayCallback callback) {
  if (running_) return true;

  {
    std::lock_guard<std::mutex> lock(mutex_);
    callback_ = std::move(callback);
    queue_.clear();
  }

  running_ = true;
  workerThread_ = std::thread(&InputReplayWorker::ThreadMain, this);
  return true;
}

void InputReplayWorker::Stop() {
  if (!running_ && !workerThread_.joinable()) return;

  running_ = false;
  cv_.notify_all();

  if (workerThread_.joinable()) {
    workerThread_.join();
  }

  std::lock_guard<std::mutex> lock(mutex_);
  queue_.clear();
  callback_ = nullptr;
}

bool InputReplayWorker::Enqueue(const SyncTransaction& transaction) {
  if (!running_) return false;

  {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.push_back(transaction);
  }

  cv_.notify_one();
  return true;
}

bool InputReplayWorker::IsRunning() const {
  return running_.load();
}

size_t InputReplayWorker::PendingCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return queue_.size();
}

void InputReplayWorker::ThreadMain() {
  while (running_) {
    SyncTransaction transaction{};
    ReplayCallback callback;

    {
      std::unique_lock<std::mutex> lock(mutex_);
      cv_.wait(lock, [this] { return !running_ || !queue_.empty(); });
      if (!running_ && queue_.empty()) {
        return;
      }

      transaction = queue_.front();
      queue_.pop_front();
      callback = callback_;
    }

    if (callback) {
      callback(transaction);
    }
  }
}
