// Remote control, the speaker's side (macOS): the supporter's mouse moves,
// clicks, wheel and keys become real input on this Mac through Quartz events.
// The Windows twin is the PowerShell helper in remote-input.js; both read the
// same lines on stdin, one command each:
//   M x y       move the pointer to x,y (global display points, top-left origin)
//   B b 1|0     button down/up (0 left, 1 middle, 2 right)
//   W dx dy     wheel (120 = one notch; dy > 0 scrolls up)
//   K kc 1|0    key down/up (macOS virtual key code, see remote-input.js)
//   T text      type text (URI-encoded), independent of the keyboard layout
//   Q           print the pointer position ("POS x y"), for tests
// Prints "ACE_READY" once it can post events, or "NOPERM" when this Mac has not
// given Ace the Accessibility permission (macOS then drops every event).
import Foundation
import CoreGraphics
import ApplicationServices

setvbuf(stdout, nil, _IOLBF, 0)

let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
print(trusted ? "ACE_READY" : "NOPERM")

let source = CGEventSource(stateID: .hidSystemState)
var pos = CGEvent(source: nil)?.location ?? .zero
var down = Set<Int>()            // mouse buttons held
var flags: CGEventFlags = []     // modifier keys held

// Clicks in a row on the same spot make a double (triple…) click: macOS reads
// the count from the event, not from the timing.
var lastClickAt = 0.0, lastClickButton = -1, lastClickPos = CGPoint.zero, clickCount = 0
let doubleClickInterval = 0.5

func post(_ e: CGEvent?) {
  guard let e = e else { return }
  e.flags = e.flags.union(flags)
  e.post(tap: .cghidEventTap)
}

func mouseTypes(_ b: Int) -> (down: CGEventType, up: CGEventType, drag: CGEventType, button: CGMouseButton) {
  switch b {
  case 2: return (.rightMouseDown, .rightMouseUp, .rightMouseDragged, .right)
  case 1: return (.otherMouseDown, .otherMouseUp, .otherMouseDragged, .center)
  default: return (.leftMouseDown, .leftMouseUp, .leftMouseDragged, .left)
  }
}

func move(_ x: Double, _ y: Double) {
  pos = CGPoint(x: x, y: y)
  // While a button is held the move is a drag, or apps see no drag at all.
  if let b = down.min() {
    let t = mouseTypes(b)
    let e = CGEvent(mouseEventSource: source, mouseType: t.drag, mouseCursorPosition: pos, mouseButton: t.button)
    e?.setIntegerValueField(.mouseEventClickState, value: Int64(max(1, clickCount)))
    post(e)
  } else {
    post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: pos, mouseButton: .left))
  }
}

func button(_ b: Int, _ isDown: Bool) {
  let t = mouseTypes(b)
  if isDown {
    let now = ProcessInfo.processInfo.systemUptime
    let near = abs(pos.x - lastClickPos.x) <= 4 && abs(pos.y - lastClickPos.y) <= 4
    clickCount = (b == lastClickButton && near && now - lastClickAt <= doubleClickInterval) ? clickCount + 1 : 1
    lastClickAt = now; lastClickButton = b; lastClickPos = pos
    down.insert(b)
  } else {
    if !down.contains(b) { return }
    down.remove(b)
  }
  let e = CGEvent(mouseEventSource: source, mouseType: isDown ? t.down : t.up, mouseCursorPosition: pos, mouseButton: t.button)
  e?.setIntegerValueField(.mouseEventClickState, value: Int64(max(1, clickCount)))
  if b == 1 { e?.setIntegerValueField(.mouseEventButtonNumber, value: 2) }
  post(e)
}

// 120 a notch from the supporter; about 40 points a notch here.
var wheelRestX = 0.0, wheelRestY = 0.0
func wheel(_ dx: Double, _ dy: Double) {
  wheelRestX += dx / 3; wheelRestY += dy / 3
  let px = Int32(wheelRestX.rounded(.towardZero)), py = Int32(wheelRestY.rounded(.towardZero))
  wheelRestX -= Double(px); wheelRestY -= Double(py)
  if px == 0 && py == 0 { return }
  post(CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2, wheel1: py, wheel2: px, wheel3: 0))
}

// Modifier keys change the held flags and go out as "flags changed", the way a
// real keyboard sends them; every other event then carries those flags.
let modifierFlag: [Int: CGEventFlags] = [
  55: .maskCommand, 54: .maskCommand,
  56: .maskShift, 60: .maskShift,
  58: .maskAlternate, 61: .maskAlternate,
  59: .maskControl, 62: .maskControl,
  63: .maskSecondaryFn,
]
var modifiersDown = Set<Int>()
func key(_ kc: Int, _ isDown: Bool) {
  guard let e = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kc), keyDown: isDown) else { return }
  if let f = modifierFlag[kc] {
    if isDown { modifiersDown.insert(kc) } else { modifiersDown.remove(kc) }
    // Left and right of one modifier share a flag: it stays while either is held.
    let still = modifiersDown.contains { modifierFlag[$0] == f }
    if still { flags.insert(f) } else { flags.remove(f) }
    e.type = .flagsChanged
    e.flags = flags
    e.post(tap: .cghidEventTap)
    return
  }
  post(e)
}

func text(_ s: String) {
  for ch in s {
    let units = Array(String(ch).utf16)
    for isDown in [true, false] {
      guard let e = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: isDown) else { continue }
      units.withUnsafeBufferPointer { e.keyboardSetUnicodeString(stringLength: units.count, unicodeString: $0.baseAddress) }
      e.post(tap: .cghidEventTap)
    }
  }
}

while let line = readLine() {
  let p = line.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
  guard let cmd = p.first else { continue }
  func num(_ i: Int) -> Double? { i < p.count ? Double(p[i]) : nil }
  switch cmd {
  case "M": if let x = num(1), let y = num(2) { move(x, y) }
  case "B": if let b = num(1) { button(Int(b), p.count > 2 && p[2] == "1") }
  case "W": if let dx = num(1), let dy = num(2) { wheel(dx, dy) }
  case "K": if let kc = num(1) { key(Int(kc), p.count > 2 && p[2] == "1") }
  case "T": if p.count > 1, let s = p[1].removingPercentEncoding { text(s) }
  case "Q":
    let at = CGEvent(source: nil)?.location ?? pos
    print("POS \(Int(at.x.rounded())) \(Int(at.y.rounded()))")
  default: break
  }
}
// stdin closed (control ended): let go of anything still held.
for b in down { button(b, false) }
for kc in modifiersDown { key(kc, false) }
