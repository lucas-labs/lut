; "Open in lut" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).
; The keys are lut's own (OpenInLut): installing or uninstalling lut never touches another app's verbs.
; Uninstalling also removes lut's manufacturer key and file-association backups (E04-13), except during an update.

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

  ${If} $UpdateMode <> 1
    ; Tauri keeps the install location key unless "delete app data" is checked; lut leaves nothing behind.
    DeleteRegKey HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    ; APP_UNASSOCIATE restores each extension's previous class but keeps lut's backup value.
    StrCpy $0 0
    lut_backup_next:
      EnumRegKey $1 HKCU "Software\Classes" $0
      StrCmp $1 "" lut_backup_done
      StrCpy $2 $1 1
      StrCmp $2 "." 0 lut_backup_skip
      DeleteRegValue HKCU "Software\Classes\$1" "lut Document_backup"
    lut_backup_skip:
      IntOp $0 $0 + 1
      Goto lut_backup_next
    lut_backup_done:
  ${EndIf}
!macroend
