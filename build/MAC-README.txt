RemoteDevJobAce — macOS
=======================

This is a Mac app. It will not run on Windows.
Windows users need RemoteDevJobAce-*-setup.exe (or the portable .exe).

This build is a universal binary (Intel x86_64 + Apple Silicon arm64).
One file works on Intel and M1 / M2 / M3 / M4.

Install (normal path)
---------------------
  1. Download the .dmg
  2. Open it and drag RemoteDevJobAce into Applications
  3. Open it from Applications (double-click)

If macOS says the app is damaged or the developer cannot be verified,
the build was not notarized. Then either:

  A. Unzip and double-click OPEN.command
  B. Or in Terminal:
       xattr -cr /Applications/RemoteDevJobAce.app
     then right-click the app → Open → Open

The first window is "Activate this computer" (license). That is expected.
Closing it quits the app.
