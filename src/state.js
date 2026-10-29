import { create } from 'zustand'

// UI-facing state only. Per-frame animation values live in world.js and are tweened by GSAP without re-renders.
export const useStore = create((set) => ({
  phase: 'loading',
  veil: 'black',
  quality: 'high',
  caption: null,
  sub: null,
  prompt: null,
  hint: null,
  skip: false,
  sound: true,
  inspect: null,
  shrineIndex: -1,
  cue: null,
  rsvp: false,
  rsvpStage: 'form',
  ack: '',
  ended: false,
  set,
}))

export const getS = () => useStore.getState()
export const setS = (p) => useStore.getState().set(p)
