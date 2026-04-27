#include "ui_text_sync.hpp"

#include <UIAutomation.h>
#include <oleauto.h>

#include <limits>

namespace {
class ComScope {
public:
  ComScope() {
    result_ = ::CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  }

  ~ComScope() {
    if (SUCCEEDED(result_)) {
      ::CoUninitialize();
    }
  }

  bool Ready() const {
    return SUCCEEDED(result_) || result_ == RPC_E_CHANGED_MODE;
  }

private:
  HRESULT result_{E_FAIL};
};

template <typename T>
class ComPtr {
public:
  ~ComPtr() {
    Reset();
  }

  T** Out() {
    Reset();
    return &value_;
  }

  T* Get() const {
    return value_;
  }

  T* operator->() const {
    return value_;
  }

  explicit operator bool() const {
    return value_ != nullptr;
  }

  void Reset() {
    if (value_) {
      value_->Release();
      value_ = nullptr;
    }
  }

private:
  T* value_{nullptr};
};

HWND RootOf(HWND hwnd) {
  return hwnd ? ::GetAncestor(hwnd, GA_ROOT) : nullptr;
}

bool IsExpectedForegroundRoot(HWND expectedRoot) {
  return !expectedRoot || RootOf(::GetForegroundWindow()) == expectedRoot;
}

std::optional<std::wstring> ConsumeBstr(BSTR value) {
  if (!value) return std::nullopt;
  std::wstring result(value, ::SysStringLen(value));
  ::SysFreeString(value);
  return result;
}

bool CreateAutomation(ComPtr<IUIAutomation>& automation) {
  return SUCCEEDED(::CoCreateInstance(
    CLSID_CUIAutomation,
    nullptr,
    CLSCTX_INPROC_SERVER,
    IID_PPV_ARGS(automation.Out()))) && automation.Get();
}

bool ElementRootMatches(IUIAutomationElement* element, HWND expectedRoot) {
  if (!expectedRoot || !element) return true;

  UIA_HWND hwndValue = 0;
  if (FAILED(element->get_CurrentNativeWindowHandle(&hwndValue)) || hwndValue == 0) {
    return true;
  }

  HWND hwnd = reinterpret_cast<HWND>(hwndValue);
  return RootOf(hwnd) == expectedRoot;
}

std::optional<std::wstring> ReadElementValue(IUIAutomationElement* element) {
  if (!element) return std::nullopt;

  ComPtr<IUIAutomationValuePattern> valuePattern;
  HRESULT hr = element->GetCurrentPatternAs(UIA_ValuePatternId, IID_PPV_ARGS(valuePattern.Out()));
  if (SUCCEEDED(hr) && valuePattern) {
    BSTR value = nullptr;
    if (SUCCEEDED(valuePattern->get_CurrentValue(&value))) {
      return ConsumeBstr(value);
    }
  }

  ComPtr<IUIAutomationTextPattern> textPattern;
  hr = element->GetCurrentPatternAs(UIA_TextPatternId, IID_PPV_ARGS(textPattern.Out()));
  if (SUCCEEDED(hr) && textPattern) {
    ComPtr<IUIAutomationTextRange> range;
    if (SUCCEEDED(textPattern->get_DocumentRange(range.Out())) && range) {
      BSTR value = nullptr;
      if (SUCCEEDED(range->GetText(-1, &value))) {
        return ConsumeBstr(value);
      }
    }
  }

  return std::nullopt;
}

bool ReadElementBoundingRect(IUIAutomationElement* element, RECT* rect) {
  if (!element || !rect) return false;
  RECT value{};
  HRESULT hr = element->get_CurrentBoundingRectangle(&value);
  if (FAILED(hr)) return false;
  if (value.right <= value.left || value.bottom <= value.top) return false;
  *rect = value;
  return true;
}

bool SetElementValue(IUIAutomationElement* element, const std::wstring& text) {
  if (!element) return false;

  ComPtr<IUIAutomationValuePattern> valuePattern;
  HRESULT hr = element->GetCurrentPatternAs(UIA_ValuePatternId, IID_PPV_ARGS(valuePattern.Out()));
  if (FAILED(hr) || !valuePattern) return false;

  BSTR value = ::SysAllocStringLen(text.data(), static_cast<UINT>(text.size()));
  if (!value) return false;

  hr = valuePattern->SetValue(value);
  ::SysFreeString(value);
  return SUCCEEDED(hr);
}

bool FindElementByCondition(
    IUIAutomation* automation,
    IUIAutomationElement* root,
    PROPERTYID property,
    VARIANT value,
    ComPtr<IUIAutomationElement>& result) {
  ComPtr<IUIAutomationCondition> condition;
  HRESULT hr = automation->CreatePropertyCondition(property, value, condition.Out());
  if (FAILED(hr) || !condition) return false;

  hr = root->FindFirst(TreeScope_Subtree, condition.Get(), result.Out());
  return SUCCEEDED(hr) && result.Get();
}

bool FindFocusedEditableElement(
    IUIAutomation* automation,
    IUIAutomationElement* root,
    ComPtr<IUIAutomationElement>& result) {
  VARIANT trueValue;
  ::VariantInit(&trueValue);
  trueValue.vt = VT_BOOL;
  trueValue.boolVal = VARIANT_TRUE;

  if (FindElementByCondition(automation, root, UIA_HasKeyboardFocusPropertyId, trueValue, result)) {
    return true;
  }

  return false;
}

bool TryMapSourcePoint(HWND sourceRoot, HWND targetRoot, const RECT& sourceRect, POINT* mappedPoint) {
  if (!sourceRoot || !targetRoot || !mappedPoint) return false;

  RECT sourceRootRect{};
  RECT targetRootRect{};
  if (!::GetWindowRect(sourceRoot, &sourceRootRect) || !::GetWindowRect(targetRoot, &targetRootRect)) {
    return false;
  }

  const int sourceWidth = sourceRootRect.right - sourceRootRect.left;
  const int sourceHeight = sourceRootRect.bottom - sourceRootRect.top;
  const int targetWidth = targetRootRect.right - targetRootRect.left;
  const int targetHeight = targetRootRect.bottom - targetRootRect.top;
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return false;

  const int sourceCenterX = sourceRect.left + ((sourceRect.right - sourceRect.left) / 2);
  const int sourceCenterY = sourceRect.top + ((sourceRect.bottom - sourceRect.top) / 2);
  mappedPoint->x = targetRootRect.left + ((sourceCenterX - sourceRootRect.left) * targetWidth) / sourceWidth;
  mappedPoint->y = targetRootRect.top + ((sourceCenterY - sourceRootRect.top) * targetHeight) / sourceHeight;
  return true;
}

long long DistanceSquaredToRectCenter(const RECT& rect, const POINT& point) {
  const long long cx = rect.left + ((rect.right - rect.left) / 2);
  const long long cy = rect.top + ((rect.bottom - rect.top) / 2);
  const long long dx = cx - point.x;
  const long long dy = cy - point.y;
  return dx * dx + dy * dy;
}

bool FindEditableElementNearPoint(
    IUIAutomation* automation,
    IUIAutomationElement* root,
    const POINT& point,
    ComPtr<IUIAutomationElement>& result) {
  VARIANT editValue;
  ::VariantInit(&editValue);
  editValue.vt = VT_I4;
  editValue.lVal = UIA_EditControlTypeId;

  ComPtr<IUIAutomationCondition> condition;
  HRESULT hr = automation->CreatePropertyCondition(UIA_ControlTypePropertyId, editValue, condition.Out());
  if (FAILED(hr) || !condition) return false;

  ComPtr<IUIAutomationElementArray> elements;
  hr = root->FindAll(TreeScope_Subtree, condition.Get(), elements.Out());
  if (FAILED(hr) || !elements) return false;

  int length = 0;
  if (FAILED(elements->get_Length(&length)) || length <= 0) return false;

  long long bestDistance = (std::numeric_limits<long long>::max)();
  for (int i = 0; i < length; ++i) {
    ComPtr<IUIAutomationElement> element;
    if (FAILED(elements->GetElement(i, element.Out())) || !element) continue;

    RECT rect{};
    if (!ReadElementBoundingRect(element.Get(), &rect)) continue;

    const long long distance = DistanceSquaredToRectCenter(rect, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      result.Reset();
      element.Get()->AddRef();
      *result.Out() = element.Get();
    }
  }

  return result.Get() != nullptr;
}
}

std::optional<UiTextSnapshot> UiTextSync::ReadFocusedTextSnapshot(HWND expectedRoot) {
  if (!IsExpectedForegroundRoot(expectedRoot)) return std::nullopt;

  ComScope com;
  if (!com.Ready()) return std::nullopt;

  ComPtr<IUIAutomation> automation;
  if (!CreateAutomation(automation)) return std::nullopt;

  ComPtr<IUIAutomationElement> element;
  HRESULT hr = automation->GetFocusedElement(element.Out());
  if (FAILED(hr) || !element || !ElementRootMatches(element.Get(), expectedRoot)) {
    return std::nullopt;
  }

  auto text = ReadElementValue(element.Get());
  if (!text.has_value()) return std::nullopt;

  UiTextSnapshot snapshot{};
  snapshot.text = *text;
  snapshot.hasBoundingRect = ReadElementBoundingRect(element.Get(), &snapshot.boundingRect);
  if (!snapshot.hasBoundingRect) {
    snapshot.boundingRect = RECT{0, 0, 0, 0};
  }
  return snapshot;
}

std::optional<std::wstring> UiTextSync::ReadFocusedText(HWND expectedRoot) {
  auto snapshot = ReadFocusedTextSnapshot(expectedRoot);
  if (!snapshot.has_value()) return std::nullopt;
  return snapshot->text;
}

bool UiTextSync::ReplaceTextInWindow(HWND rootHwnd, const UiTextSnapshot& snapshot, HWND sourceRoot) {
  if (!rootHwnd || !::IsWindow(rootHwnd)) return false;

  ComScope com;
  if (!com.Ready()) return false;

  ComPtr<IUIAutomation> automation;
  if (!CreateAutomation(automation)) return false;

  ComPtr<IUIAutomationElement> root;
  HRESULT hr = automation->ElementFromHandle(rootHwnd, root.Out());
  if (FAILED(hr) || !root) return false;

  ComPtr<IUIAutomationElement> target;
  POINT mappedPoint{};
  if (snapshot.hasBoundingRect && TryMapSourcePoint(sourceRoot, rootHwnd, snapshot.boundingRect, &mappedPoint)) {
    FindEditableElementNearPoint(automation.Get(), root.Get(), mappedPoint, target);
  }

  if (!target && !FindFocusedEditableElement(automation.Get(), root.Get(), target)) {
    return false;
  }

  return SetElementValue(target.Get(), snapshot.text);
}

bool UiTextSync::ReplaceTextInWindow(HWND rootHwnd, const std::wstring& text) {
  UiTextSnapshot snapshot{};
  snapshot.text = text;
  snapshot.boundingRect = RECT{0, 0, 0, 0};
  snapshot.hasBoundingRect = false;
  return ReplaceTextInWindow(rootHwnd, snapshot, nullptr);
}
