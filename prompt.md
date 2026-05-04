I need to make an electron app.

Window format.
   It should be stelth app. So the others who supervise this computer can't see this app. And this should be switchable between visible and nonvisible. And the opacity should be controllable from 0 to 100% on a small slide my draging mouse cursor on it without clicking. And the theme should be light. And the window size should be adjustable. And there should be hot keys for hide or not, move right, move left, move up, move down, opacity up and down. And the app window should always be on the top. And the standard window size should be 400px 700px. And there should be only thin header bar and margin for left, right, and botton should be 0.
   First give me plans for this and don't make any changes yet.
Function.
   1. It should be able to open a website in it using a link. Like chatgpt.com or clude.ai like chatgpt or claude app. 
   2. It should be able to capture sound (English or some other language) from a certain window on system (user select this in advance) and emit the content to the input where the mouse focus is on.
   3. In this app, there should be two modes, one is speaker who take part in the speak, and the other one is his supporter. The supporter should run this app on the other computer which is connected to the speaker's computer through the local network. The standard ip address is 172.16.98.11 and the port should be 2000.
   4. When the support mode in A's computer accessed to the B's computer's speak mode, the support should be able to hear the sound from the system and the sound from the B's microphone.
   

Q1. it should be selectable by dropdownlist, not by tabs. And the dropdownlist should be in the left or right of the app window, not on the top side.
Q2. It should be Presetable before starting interview mode. User should be able to add several urls. And once in the interview mode, there shouldn't be any urls above just display the content of the browser.
Q3. All sounds from the system and the voice from the microphone.
Q4. Implement both. 
Q5. Yes, Streaming.
Q6.  the focused input of the foreground app (standard interpretation)
Q7. auto-paste continuously while transcription is running
Q8. Speaker's machine
Q9. Lan Socket.
Q10. Implement two functions but should be toggled.


image, sound, text,  with supporter, 


Very Good, I am very satisfied with your work now.
Now I want to update Network mode here.
I will explain the current implementation.
In the current app let's assume speaker as A, and suppoter as B, and C as someone who has online with A(via google meeting, Teams, Zoom, telegram, discord, whatsapp ... ).
A speaks through microphone and there comes sounds from A's computer. Then B can hear the both(A's microphone and A's OS sound) when B is connected to A's computer with this app. A has a online meeting with C, A speaks but C can't hear it. I think microphone is not shared together with this app and other meeting platforms. And B speaks but A can't hear B's sound as well.
What I want to update here:
I want to allow this app to receive A's microphone voice and send it to the other platform. So that in the meeting platform A can select source of sound. As a result, B in the support mode and C who is talking with A on meeting or other platform can hear A' voice at the same time.
And another important thing here, A should be able to hear B's voice (voice only not system sound) as well. Here there are two modes. In mode 1, A speaks with C on meeting, A and C speak and hear. B is in the support mode, B hear A's voice and C's voice(Through A's system sound) as well through this voice. A also hear B's voice through this app. But C can't hear B's voice.
Sometimes B should change B's voice mode into mute, A can only listen (C can't hear B's voice), and A and C can listen together B's voice (here A's voice is muted and C can't hear A's voice).
This mode can be changed by A or B. There should be alerts for both A and B that explains current situation. And the most important thing is that C can only hear A or B's sound at once not A and B at the same time. Implement this function.


I will add some function here.
In some cases, B needs to send something by text or image, once B joins as a support mode, make a new tab in the main app window and display a chat page there.
In the chat, B can send any text or image (by drag and drop). On the A's side, these texts and images should be displayed on the sticky note like extra window which is next to the main window. It's size should be same width and half height of main window, and same opacity and and same visibility with main window. I mean, once main window's opacity or visibility changes, extra window's opacity or visibility should also be changed. It's bg color should be white as well. And once I click ctrl + left, close extra window, when i click ctrl+right, open that (with previous hisotry) again. And B sends message or image then the extran window opens on the A's side. A sometimes should ask for help to B by clicking hotkey win+?, once A click it, there should be alert "Help me!!!" on the B's side. First tell me what you understood and once I confirm then implement.


In the current app, once the B is connected to the A, then A clicks "kick" in the supporter list, then B is kicked, but after 3 or 5 seconds later B is connected again. This is a bug, fix it.


I will add some function here.
In some cases, B needs to send something by text or image, once B joins as a support mode, make a new tab in the main app window and display a chat page there.
In the chat, B can send any text or image (by drag and drop). On the A's side, these texts and images should be displayed on the sticky note like extra window which is next to the main window. It's size should be same width and half height of main window, and same opacity and and same visibility with main window. I mean, once main window's opacity or visibility changes, extra window's opacity or visibility should also be changed. It's bg color should be white as well. And once I click ctrl + left, close extra window, when i click ctrl+right, open that (with previous hisotry) again. And B sends message or image then the extran window opens on the A's side. A sometimes should ask for help to B by clicking hotkey win+?, once A click it, there should be alert "Help me!!!" on the B's side. First tell me what you understood and once I confirm then implement.


I think, when creating the connection between A and B it should allow two-way communication. 
And remove enable two-way mic setting, always allow it. 
Instead, on B's side there should be three modes for B's mic, mute, speaks to only A, speaks to A and C.
And in the current app A can't toggle live mode, allow A to toggle the speak mode.
And in the connected list allow one user at once You can see the same IP address at the same time. Fix this. And give me exact guide for output device set.
I think it's better to create a new way for output mic so that in the google meeting or other platform A can select an extra voice source (with this app)for the meeting.

First tell me if it is acceptable, and what you understood. Once I confirm everything then proceed.


Q1, ok,
Q2, aOnly
Q3, ok
Q4, yes
Q5, yes
Q6. IP+port and make it only one supporter not 1 to N make it 1 to 1.
And on B's side, chat page is now in the setting, I want to show chat page in the main page as soon as join as a supporter mode.
