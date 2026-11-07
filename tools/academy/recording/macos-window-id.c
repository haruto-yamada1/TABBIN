// Read-only helper for screencapture -l. It never launches or attaches to Chrome.
// Match the dedicated Chrome for Testing window by its exact visible title.
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <stdio.h>

int main(int argc, const char *argv[]) {
  if (argc != 2) {
    fprintf(stderr, "Usage: macos-window-id '<exact Chrome for Testing title>'\n");
    return 2;
  }
  CFStringRef expected = CFStringCreateWithCString(
      kCFAllocatorDefault, argv[1], kCFStringEncodingUTF8);
  if (!expected) return 2;
  CFArrayRef windows = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!windows) {
    CFRelease(expected);
    fprintf(stderr, "Cannot read on-screen windows. Check OS permissions.\n");
    return 1;
  }
  int matches = 0;
  int matchedId = 0;
  for (CFIndex i = 0; i < CFArrayGetCount(windows); i++) {
    CFDictionaryRef window = CFArrayGetValueAtIndex(windows, i);
    CFStringRef owner = CFDictionaryGetValue(window, kCGWindowOwnerName);
    CFStringRef title = CFDictionaryGetValue(window, kCGWindowName);
    CFNumberRef layerValue = CFDictionaryGetValue(window, kCGWindowLayer);
    CFNumberRef idValue = CFDictionaryGetValue(window, kCGWindowNumber);
    int layer = -1;
    if (!owner || !title || !layerValue || !idValue) continue;
    CFNumberGetValue(layerValue, kCFNumberIntType, &layer);
    if (layer != 0 ||
        CFStringCompare(owner, CFSTR("Google Chrome for Testing"), 0) !=
            kCFCompareEqualTo ||
        CFStringCompare(title, expected, 0) != kCFCompareEqualTo) continue;
    matches++;
    CFNumberGetValue(idValue, kCFNumberIntType, &matchedId);
  }
  CFRelease(windows);
  CFRelease(expected);
  if (matches != 1 || matchedId <= 0) {
    fprintf(stderr, "Expected one matching dedicated window; found %d.\n", matches);
    return 1;
  }
  printf("%d\n", matchedId);
  return 0;
}
