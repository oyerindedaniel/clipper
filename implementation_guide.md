# Implementation Guide

## Project Goal

Build an Electron app that allows you to:

- 📺 Watch a Twitch stream inside the app.
- 🎥 Record both video and system audio of that stream.
- 🧠 Continuously buffer the recording (e.g., last 15 minutes).
- ⌨️ Use hotkeys to "mark" interesting moments.
- ✂️ Open a lightweight editor to trim/save/export those marked clips.

## Key Considerations and Improvements

This is a well-structured plan for a complex application. Here are some general considerations and potential improvements that could enhance performance, user experience, and development efficiency:

- **Performance Optimization**: Continuous video and audio recording, especially with buffering, can be resource-intensive. Prioritize efficient handling of media streams and storage to prevent the app from becoming sluggish or consuming excessive CPU/memory.
- **User Experience (UX)**: Think about feedback mechanisms for recording status, hotkey presses, and export progress. A smooth and intuitive editor interface will be crucial.
- **Error Handling**: Implement robust error handling for all critical operations, especially media capture, file I/O, and FFmpeg execution.
- **Scalability**: While this is a desktop app, consider how the design might accommodate future features, such as integrating with other streaming platforms or more advanced editing capabilities.

## Implementation Plan (Laser-Focused)

### 🖥 Electron App Shell

**Purpose:**
Runs a local desktop app with full system access and screen capture capabilities.

**Tech:**

- `electron`
- `electron-forge` or `electron-builder` (packaging)
- Preload script for safe IPC

**Improvements/Considerations:**

- **Development Setup**: For faster development and hot-reloading, consider using a boilerplate like `electron-react-boilerplate` or a build tool like `electron-vite` if you're integrating with a frontend framework like React or Vue.
- **Security (Preload Script)**: Strictly use `contextBridge` in the preload script to expose only necessary APIs to the renderer process, preventing direct Node.js access and potential security vulnerabilities.
- **Main/Renderer Process Communication**: Establish clear IPC (Inter-Process Communication) channels for commands between the main process (handling system interactions like recording, hotkeys) and the renderer process (UI, embedded viewer).

### 🧲 Embedded Twitch Viewer

**Purpose:**
Lets you watch Twitch.com inside the app window.

**Approach:**

- Use Electron `BrowserWindow` to load `twitch.tv`.
- Set `user-agent` + `headers` to behave like Chrome.

**Note:**
CORS does not block in Electron, so you have full access.

**Improvements/Considerations:**

- **`webview` Tag**: For better isolation and security, especially if Twitch.tv might have unexpected scripts, consider using the `<webview>` tag instead of a direct `BrowserWindow` within your main window. This runs the guest content in a separate process.
- **Twitch API Integration**: To enhance the viewer experience, you might want to integrate with the Twitch API to fetch stream metadata (e.g., streamer name, game, stream title) for display within the app or for naming saved clips. This would involve OAuth authentication with Twitch.
- **User Agent**: Ensure the `user-agent` is set to a recent Chrome version to avoid potential issues with Twitch's website rendering or functionality.

### 🎥 Screen + Audio Recorder

**Purpose:**
Captures both the Twitch video and system audio — even when minimized or on another window.

**Approach:**

- Use Electron’s `desktopCapturer` API to get the screen or window.
- Use `navigator.mediaDevices.getUserMedia()` + `chromeMediaSourceId` for capture.
- Use `MediaRecorder` to continuously record stream into memory (e.g., chunks).
- Keep a rolling buffer in memory or `IndexedDB` (e.g., last 15 minutes of WebM blobs).

**System Audio:**
Use `getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } } })` on Windows/macOS to capture system audio. Needs permissions.

**Improvements/Considerations:**

- **`desktopCapturer.getSources()`**: You'll need to use `desktopCapturer.getSources({ types: ['window', 'screen'] })` to allow the user to select which screen or window to capture.
- **Permissions**: Clearly communicate to the user that screen recording and system audio permissions are required, especially on macOS (via `app.setAboutPanelOptions` or similar system prompts).
- **Buffering Strategy**:
  - **Memory vs. IndexedDB**: For 15 minutes of video, memory might be constrained, especially for higher resolutions. `IndexedDB` is a more robust option for larger buffers, but consider its performance impact on continuous writes.
  - **Chunk Management**: When using `MediaRecorder` with chunks, ensure efficient management of these chunks (e.g., merging them periodically or handling them as a circular buffer). You'll need to precisely manage the "last 15 minutes" by dropping older chunks.
  - **WebM vs. Other Formats**: WebM is suitable for in-browser recording. For efficient storage and later FFmpeg processing, you might want to explore other interim formats or codecs if performance becomes an issue.
- **Hardware Acceleration**: Investigate if Electron or underlying Chromium features can leverage hardware acceleration for video encoding/decoding to reduce CPU load during recording.
- **Alternative Audio Capture (Advanced)**: On some systems, `chromeMediaSource: 'desktop'` might have limitations. For more robust system audio capture, especially on Windows, you might explore native Node.js add-ons (e.g., N-API modules) that interact with WASAPI or Core Audio, or even integrate with tools like VB-Cable.

### 🕹️ Hotkey System (Clip Marker)

**Purpose:**
Mark timestamps where something funny/good happened.

**Approach:**

- Register `globalShortcut` in Electron (e.g., Ctrl+Shift+M).
- On press:
  - Note current buffer timestamp (or chunk index).
  - Mark that index in memory (10 seconds before and after).

**Data structure:**
Array of `{ timestampStart, timestampEnd }` relative to stream

**Improvements/Considerations:**

- **Hotkey Conflicts**: Be aware that `globalShortcut` can conflict with other applications' hotkeys. Provide an option for the user to customize the hotkey.
- **Granularity of Marking**: Instead of fixed 10 seconds before/after, consider allowing the user to configure this duration or even manually adjust it in the editor.
- **Metadata for Clips**: Enhance the data structure to include more metadata for each marked clip, such as:
  - `streamerName`
  - `streamTitle`
  - `game`
  - `userNotes` (a short text field for the user to describe the clip)
  - `markedAt` (timestamp when the hotkey was pressed)
- **Visual Feedback**: Provide subtle visual feedback (e.g., a small toast notification or a change in a UI element) when a hotkey is pressed and a clip is marked.

### ✂️ Editor Module (Comprehensive)

**Purpose:**
A robust editor to view, refine, and export marked clips.

**Key Features & Interface:**

- **Editor Interface**: A dedicated, intuitive UI for clip manipulation.
- **Video Preview**: Integrate a video player to preview the selected clip.
- **Timeline of Clip**: A visual timeline representing the selected clip's duration.
- **Timeline Scrubber**: Allow users to scrub through the clip on the timeline for precise navigation.
- **Start/End Trim**: Enable users to define the exact start and end points of their clip using draggable handles on the timeline or numerical inputs.
- **Text Overlays**:
  - **Captions**: Add customizable text captions at specific timestamps.
  - **Meme Text**: Support adding meme-style text overlays with various fonts and styles.
- **Background Audio Track**: Provide functionality to add a separate background audio track (e.g., music) to the clip, with volume control.
- **Configurable Clip Duration**: Instead of fixed 10 seconds before/after a marker, allow users to:
  - **Configure Default Duration**: Set a preferred default duration for clips created via hotkeys.
  - **Manual Adjustment**: Precisely adjust the start and end points in the editor, overriding default hotkey-marked durations.
- **Preview + Export**:
  - **Real-time Preview**: Offer a live preview of the trimmed clip, including any text overlays and background audio.
  - **Export Options**: Export the final clip in a user-selected format (e.g., MP4) with options for quality and resolution.

**Approach:**

- Utilize `React` (or chosen UI framework) for building the interactive editor UI.
- Video preview via `<video>` tag or a more advanced library like `react-player`.
- Custom timeline component with draggable markers and scrubber. Consider libraries for waveform visualization for audio.
- Overlay text rendering directly onto the video frames during export (handled by FFmpeg).
- FFmpeg (spawned via `child_process`) for all heavy-lifting:
  - Merging video, original audio, text overlays, and new background audio.
  - Trimming the video based on user-defined start/end points.
  - Converting to target format (e.g., MP4).

**FFmpeg Integration Considerations:**

- **Bundling FFmpeg**: Bundle the FFmpeg executable with the Electron app.
- **Progress Feedback**: Provide real-time progress feedback during export by parsing FFmpeg's console output.
- **Error Handling**: Implement robust error handling for FFmpeg operations.
- **Asynchronous Execution**: Ensure FFmpeg processes run asynchronously to avoid UI freezes.
- **Optimization**: Explore FFmpeg flags for faster encoding, smaller file sizes, and hardware acceleration options.

### 💾 Local Clip Storage

**Purpose:**
Store recorded clips or buffers locally.

**Approach:**

- Use temporary folder (e.g., `app.getPath('temp')`) for circular buffer
- Save trimmed clips to user’s Videos or app folder
- Optionally auto-name by date/streamer name

**Improvements/Considerations:**

- **Temporary Folder Management**: Ensure proper cleanup of temporary buffer files when the app closes or the buffer is reset.
- **User-Configurable Save Location**: Allow users to customize where their trimmed clips are saved.
- **Metadata Storage**: Besides the video file, store the clip's metadata (timestamps, streamer info, user notes) in a structured format (e.g., a JSON file per clip, or a lightweight embedded database like `sqlite3`) alongside the video file or in a central database. This will make it easier to manage and display clips within the editor.
- **File Naming**: Implement a robust file naming convention (e.g., `[StreamerName]_[Date]_[Time]_[ClipTitle].mp4`) to make saved clips easily identifiable.

### 🧪 Optional: Testing Flow

- Use test Twitch account
- Open in Electron window
- Mark moments with hotkey
- Export clip → review in player

**Improvements/Considerations:**

- **Unit Testing**: Implement unit tests for individual functions and modules (e.g., buffer management logic, hotkey handling logic, FFmpeg command generation).
- **Integration Testing**: Test the interactions between different modules (e.g., recording to buffer, hotkey marking timestamps, editor loading clips from buffer).
- **End-to-End Testing**: Use tools like [Spectron](https://www.electron.build/api/electron-builder-api/interfaces/_base_builder_.configuration) (for Electron apps) or [Playwright](https://playwright.dev/) (for broader web app testing) to simulate user interactions and test the entire application flow, from launching the app to exporting a clip.
