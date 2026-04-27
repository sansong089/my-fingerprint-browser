{
  "targets": [
    {
      "target_name": "win32_window",
      "sources": [
        "src/addon.cpp",
        "src/input_replay.cpp",
        "src/window_manager.cpp",
        "src/text_session.cpp",
        "src/ui_text_sync.cpp",
        "src/monitor_manager.cpp",
        "src/sync_manager.cpp"
      ],
      "include_dirs": [
        "d:/00-work/mywork/my-fingerprint-browser/native/win32-window/node_modules/node-addon-api"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        [
          "OS == 'win'",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              },
              "VCLinkerTool": {
                "AdditionalDependencies": ["user32.lib", "gdi32.lib", "ole32.lib", "oleaut32.lib", "uiautomationcore.lib"]
              }
            }
          }
        ]
      ]
    }
  ]
}
