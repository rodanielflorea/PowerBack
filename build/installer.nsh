; Additions to electron-builder's NSIS script.
;
; This file is compiled twice, once for the installer and once for the
; uninstaller (BUILD_UNINSTALLER), and it is included before the stock script,
; so it only declares: nothing here runs until a stock hook inserts a macro.
;
; Folder
;   A per-user install lives in a folder named after the product, ...\Programs\Ace.
;   The stock script names the folder after the package ("ace") and, on an
;   upgrade, re-uses whatever folder the registry names, so an install made
;   while the app was called RemoteDevJobAce never left that folder. The
;   previous version is still removed from its own folder, by its own
;   uninstaller: the stock upgrade step takes that folder from the registry,
;   which is rewritten only after the new files are in place.
;
; Running copy
;   The stock check finds the app by the name of its executable. That misses
;   versions up to 2.4.1, which ran under other names (DevAssistant.exe,
;   RemoteDevJobAce.exe), an executable renamed by hand, and the guardian: a
;   second process that starts the app again when it is closed and is itself
;   started again by the app. Here a running copy is found by the folder it
;   runs from, and app and guardian are stopped together.

; ACE_MODE for the PowerShell text below: "count" only counts, "ask" asks the
; processes to close, "kill" ends them. The exit code is 100 + the number found
; (before anything was closed); any other code means the search itself did not
; work and is handed back as 0. Folders travel in environment variables, so
; that no path has to be quoted inside the PowerShell text. A drive root is
; not accepted as a folder: it would match every program on the drive. Never
; counted: the process that runs the search (ACE_SELF), an uninstaller, and,
; with ACE_UN set, the process that started this one (the setup that runs the
; uninstaller of the previous version, wherever the setup file lies).
!macro aceFindRunningCopy MODE RESULT
  System::Call 'kernel32::SetEnvironmentVariable(t "ACE_MODE", t "${MODE}")'
  nsExec::Exec /TIMEOUT=30000 `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "$$d=@(($$env:ACE_DIRS+'').Split('|')|?{$$_}|%{$$_.TrimEnd('\')+'\'}|?{$$_.Length -gt 3}); $$g=@(($$env:ACE_DATA+'').Split('|')|?{$$_}|%{$$_.TrimEnd('\')+'\'}|?{$$_.Length -gt 3}); try{$$a=@(Get-CimInstance Win32_Process -ErrorAction Stop)}catch{exit 1}; $$k=@([int]$$env:ACE_SELF); if($$env:ACE_UN){$$k+=@($$a|?{$$_.ProcessId -eq $$k[0]}|%{$$_.ParentProcessId})}; $$x=@($$a|?{$$p=$$_.ExecutablePath; $$p -and $$k -notcontains $$_.ProcessId -and $$_.Name -notlike 'Uninstall *' -and (@($$d|?{$$p.StartsWith($$_,'OrdinalIgnoreCase')}).Count -or (@($$g|?{$$p.StartsWith($$_,'OrdinalIgnoreCase')}).Count -and $$_.Name -like '*Guardian*'))}); if($$env:ACE_MODE -eq 'ask'){$$x|%{& taskkill.exe /PID $$_.ProcessId 2>&1|Out-Null}}; if($$env:ACE_MODE -eq 'kill'){$$x|%{Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue}}; $$n=$$x.Count; if($$n -gt 99){$$n=99}; exit (100+$$n)"`
  Pop ${RESULT}
  ; 100 to 199 is an answer; "error", "timeout" and every other code is none
  ${if} ${RESULT} < 100
  ${orIf} ${RESULT} > 199
    StrCpy ${RESULT} 0
  ${endif}
!macroend

; The guardian leaves when it finds this file in the app's data folder. It is
; written again before every attempt, because a guardian removes it on leaving.
!macro aceTellGuardian FOLDER
  ${if} ${FileExists} "${FOLDER}\guardian.pid"
    ClearErrors
    FileOpen $R7 "${FOLDER}\watchdog-stop" w
    ${ifNot} ${Errors}
      FileWrite $R7 "setup"
      FileClose $R7
    ${endif}
    ClearErrors
  ${endif}
!macroend

!macro aceTellGuardians
  !ifdef APP_PACKAGE_NAME
    !insertmacro aceTellGuardian "$APPDATA\${APP_PACKAGE_NAME}"
  !endif
  !insertmacro aceTellGuardian "$APPDATA\RemoteDevJobAce"
!macroend

; Replaces the stock check, in the installer and in the uninstaller.
!macro customCheckAppRunning
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  ; The folder of the version that is installed now: until the new files are
  ; in place the registry still names it.
  ReadRegStr $R6 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation

  ; A first install has nothing that could be running.
  StrCpy $R5 "0"
  ${if} $R6 != ""
    StrCpy $R5 "1"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\*.*"
    StrCpy $R5 "1"
  ${endif}
  !ifdef APP_PACKAGE_NAME
    ${if} ${FileExists} "$APPDATA\${APP_PACKAGE_NAME}\*.*"
      StrCpy $R5 "1"
    ${endif}
  !endif
  ${if} ${FileExists} "$APPDATA\RemoteDevJobAce\*.*"
    StrCpy $R5 "1"
  ${endif}

  ${if} $R5 == "1"
    System::Call 'kernel32::GetCurrentProcessId() i .s'
    Pop $R9
    System::Call 'kernel32::SetEnvironmentVariable(t "ACE_SELF", t "$R9")'
    !ifdef BUILD_UNINSTALLER
      System::Call 'kernel32::SetEnvironmentVariable(t "ACE_UN", t "1")'
    !endif
    ; $INSTDIR counts only when the app is in it. In the uninstaller it is the
    ; folder the uninstaller file was started from, until the stock script has
    ; read the registry; with /D it can be any folder.
    StrCpy $R8 "$R6"
    ${if} ${FileExists} "$INSTDIR\resources\app.asar"
      StrCpy $R8 "$R6|$INSTDIR"
    ${endif}
    System::Call 'kernel32::SetEnvironmentVariable(t "ACE_DIRS", t "$R8")'
    !ifdef APP_PACKAGE_NAME
      System::Call 'kernel32::SetEnvironmentVariable(t "ACE_DATA", t "$APPDATA\${APP_PACKAGE_NAME}|$APPDATA\RemoteDevJobAce")'
    !else
      System::Call 'kernel32::SetEnvironmentVariable(t "ACE_DATA", t "$APPDATA\RemoteDevJobAce")'
    !endif

    !insertmacro aceFindRunningCopy "count" $R8
    ${if} $R8 > 100
      ; Started by hand: ask first, as the stock check does. An update started
      ; by the app itself, or a silent run, goes on without asking.
      ${ifNot} ${Silent}
      ${andIfNot} ${isUpdated}
        ${if} ${Cmd} `MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDCANCEL`
          Quit
        ${endif}
      ${endif}

      DetailPrint `Closing running "${PRODUCT_NAME}"...`
      !insertmacro aceTellGuardians
      ; Politely first: the app then saves what it has and leaves by itself.
      !insertmacro aceFindRunningCopy "ask" $R8
      Sleep 2000

      StrCpy $R5 0
      ${do}
        !insertmacro aceFindRunningCopy "count" $R8
        ; nothing left, or the search stopped working (dealt with below)
        ${if} $R8 <= 100
          ${exitDo}
        ${endif}
        IntOp $R5 $R5 + 1
        ${if} $R5 > 5
          ; It does not go away: the user closes it, or the setup stops here.
          ${if} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDCANCEL`
            Quit
          ${endif}
          StrCpy $R5 0
        ${endif}
        !insertmacro aceTellGuardians
        !insertmacro aceFindRunningCopy "kill" $R8
        ; longer than the second the guardian waits between two looks
        Sleep 1500
      ${loop}
    ${endif}

    ; PowerShell could not be used: the names the app has had, ended without a
    ; question, because nothing can tell whether a copy is running.
    ${if} $R8 < 100
      ; ${isUpdated} above keeps its answer in $R9: the own process id again
      System::Call 'kernel32::GetCurrentProcessId() i .s'
      Pop $R9
      !insertmacro aceTellGuardians
      nsExec::Exec /TIMEOUT=20000 `"$SYSDIR\cmd.exe" /c taskkill /f /im DevGuardian.exe /im DevAssistant.exe /im RemoteDevJobAce.exe /im "${APP_EXECUTABLE_FILENAME}" /fi "PID ne $R9" /fi "USERNAME eq %USERNAME%"`
      Pop $R8
      Sleep 1500
    ${endif}
  ${endif}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
!macroend

!ifndef BUILD_UNINSTALLER

  ; The folder name that versions 2.1 to 2.3 chose by themselves. 2.4.0 and
  ; 2.4.1 used the package name, which the stock script passes as APP_FILENAME.
  !define /ifndef ACE_OLD_FOLDER "RemoteDevJobAce"

  Var aceOldDir          ; where the previous version lives, "" on a first install
  Var aceOldName         ; "1" when that folder has one of the names above
  Var aceNoDesktopLink   ; "1" when the user had removed the desktop shortcut

  ; Runs after the stock script has chosen the folder: the one the registry
  ; names, or <Programs>\<package name> on a first install.
  !macro customInit
    ReadRegStr $aceOldDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    StrCpy $aceOldName "0"
    ${if} $aceOldDir != ""
      ${GetFileName} "$aceOldDir" $R2
      ${if} $R2 == "${APP_FILENAME}"
      ${orIf} $R2 == "${ACE_OLD_FOLDER}"
        StrCpy $aceOldName "1"
      ${endif}
    ${endif}

    ; Same place, named after the product. Only a name the app chose by itself
    ; is replaced: a folder of any other name, given with /D, is kept, in this
    ; run and, through the registry, in every later update.
    ${if} $installMode == "CurrentUser"
      ${StdUtils.GetParameter} $R0 "D" ""
      ${if} $R0 == ""
        ${GetFileName} "$INSTDIR" $R2
        ${if} $R2 == "${APP_FILENAME}"
        ${orIf} $R2 == "${ACE_OLD_FOLDER}"
          ${GetParent} "$INSTDIR" $R1
          ${if} $R1 != ""
            StrCpy $INSTDIR "$R1\${PRODUCT_NAME}"
          ${endif}
        ${endif}
      ${endif}
    ${endif}

    ; The move puts the shortcuts back, because they name the executable. A
    ; desktop shortcut the user had removed is taken away again afterwards.
    ; "Removed" means: no file <ShortcutName>.lnk on the desktop. A shortcut
    ; the user renamed or moved counts as removed: no new one is put next to
    ; it, and it has to be pointed at the new executable by hand. Leftovers in
    ; the registry without an app on disk are a first install, with shortcuts.
    StrCpy $aceNoDesktopLink "0"
    ${if} $aceOldDir != ""
    ${andIf} ${FileExists} "$aceOldDir\resources\app.asar"
      ReadRegStr $R2 HKCU "${INSTALL_REGISTRY_KEY}" ShortcutName
      ${if} $R2 != ""
      ${andIfNot} ${FileExists} "$DESKTOP\$R2.lnk"
        StrCpy $aceNoDesktopLink "1"
      ${endif}
    ${endif}
  !macroend

  ; Runs after the previous version was removed and the new one is in place.
  !macro customInstall
    ${if} $aceOldDir != ""
      ; != ignores the case of letters: "ace" and "Ace" are one folder
      ${if} $aceOldDir != $INSTDIR
        ; The previous uninstaller emptied its folder but could not remove the
        ; folder it was working in. Without /r only an empty folder goes.
        RMDir "$aceOldDir"
        ; Still a whole app in it: the previous uninstaller could not be
        ; started, and the stock script went on without it. The folder is
        ; removed only if it has a name the app chose by itself, does not hold
        ; the executable that was just installed, and the new folder does not
        ; lie inside it.
        StrLen $R0 "$aceOldDir\"
        StrCpy $R1 "$INSTDIR\" $R0
        ${if} $aceOldName == "1"
        ${andIf} $R1 != "$aceOldDir\"
        ${andIf} ${FileExists} "$aceOldDir\resources\app.asar"
        ${andIfNot} ${FileExists} "$aceOldDir\${APP_EXECUTABLE_FILENAME}"
          RMDir /r "$aceOldDir"
          ${if} $oldDesktopLink != $newDesktopLink
            Delete "$oldDesktopLink"
          ${endif}
          ${if} $oldStartMenuLink != $newStartMenuLink
            Delete "$oldStartMenuLink"
          ${endif}
        ${endif}
      ${endif}
      ClearErrors
    ${endif}

    ; The folder may exist under the same name in other letters ("ace"): then
    ; only the spelling changes. What counts is the name on disk, so that a
    ; rename that did not work is tried again by the next update. The folder
    ; cannot be renamed while it is the working folder.
    ${GetFileName} "$INSTDIR" $R2
    ClearErrors
    FindFirst $R0 $R1 "$INSTDIR"
    ${ifNot} ${Errors}
      FindClose $R0
      ; == ignores the case of letters, S!= does not
      ${if} $R1 == $R2
      ${andIf} $R1 S!= $R2
        ${GetParent} "$INSTDIR" $R3
        SetOutPath "$PLUGINSDIR"
        Rename "$R3\$R1" "$INSTDIR"
        SetOutPath "$INSTDIR"
        ; The shortcuts were written while the folder still had its old
        ; spelling and show it in their properties: written again, as the
        ; stock script writes them.
        ${if} ${FileExists} "$newStartMenuLink"
          CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
        ${endif}
        ${if} ${FileExists} "$newDesktopLink"
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${endif}
      ${endif}
    ${endif}
    ClearErrors

    ${if} $aceNoDesktopLink == "1"
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
      ClearErrors
    ${endif}
  !macroend

!else

  ; End of an uninstall. The stock script removes the files but not the folder,
  ; because the folder is what the uninstaller is working in. During an update
  ; the folder is needed again at once and stays.
  !macro customUnInstall
    ${ifNot} ${isUpdated}
      SetOutPath "$TEMP"
      RMDir "$INSTDIR"
      ClearErrors
    ${endif}
  !macroend

!endif
