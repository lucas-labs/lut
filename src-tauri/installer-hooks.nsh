; "Open in Terax" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTerax" "" "Open in Terax"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTerax" "Icon" '"$INSTDIR\lut.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTerax" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTerax\command" "" '"$INSTDIR\lut.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTerax" "" "Open in Terax"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTerax" "Icon" '"$INSTDIR\lut.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTerax" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTerax\command" "" '"$INSTDIR\lut.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTerax" "" "Open in Terax"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTerax" "Icon" '"$INSTDIR\lut.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTerax" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTerax\command" "" '"$INSTDIR\lut.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInTerax"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInTerax"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInTerax"
!macroend
