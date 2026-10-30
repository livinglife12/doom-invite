// Exclude inactive lights without rebuilding the scene or losing its state.
export function stageVisible(stage, state) {
  if (stage === 'tv') return state.tv.visible
  if (stage === 'throne') return state.throneVisible
  if (stage === 'hall') return state.hall.visible && (state.hall.lights > 0 || state.hall.keyOn > 0 || state.hall.collapse > 0)
  if (stage === 'collapse') return state.hall.collapse > 0 && state.env.void > 0.001
  if (stage === 'mask') return state.mask.visible
  if (stage === 'page') return state.page.visible
  return false
}

// Restore only timeline/audio states that this page changed when it went hidden.
export function createVisibilityController({ setLoop, timeline, getAudio }) {
  let paused = false, resumeTimeline = false, suspendedAudio = null, pendingSuspend = null
  return visible => {
    setLoop(visible ? 'always' : 'never')
    if (!visible && !paused) {
      paused = true
      resumeTimeline = !timeline.paused()
      if (resumeTimeline) timeline.pause()
      const context = getAudio()
      if (context?.state === 'running') {
        suspendedAudio = context
        pendingSuspend = context.suspend().catch(() => {})
      }
    } else if (visible && paused) {
      paused = false
      if (resumeTimeline) timeline.resume()
      const context = suspendedAudio, pending = pendingSuspend
      suspendedAudio = null
      pendingSuspend = null
      resumeTimeline = false
      if (context) return Promise.resolve(pending).then(() => {
        if (!paused && context.state === 'suspended') return context.resume()
      }).catch(() => {})
    }
  }
}
