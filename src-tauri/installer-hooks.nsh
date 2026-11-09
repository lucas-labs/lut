; "Open in lut" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).
; The keys are lut's own (OpenInLut): installing or uninstalling lut never touches another app's verbs.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLut" "" "Open in lut"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLut" "Icon" '"$INSTDIR\lut.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLut" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLut\command" "" '"$INSTDIR\lut.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLut" "" "Open in lut"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLut" "Icon" '"$INSTDIR\lut.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLut" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLut\command" "" '"$INSTDIR\lut.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLut" "" "Open in lut"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLut" "Icon" '"$INSTDIR\lut.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLut" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLut\command" "" '"$INSTDIR\lut.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInLut"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInLut"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInLut"
!macroend
