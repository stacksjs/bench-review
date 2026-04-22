import { Editor } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'

declare global {
  interface Window {
    Tiptap: {
      Editor: typeof Editor
      Link: typeof Link
      Placeholder: typeof Placeholder
      StarterKit: typeof StarterKit
    }
  }
}

window.Tiptap = { Editor, Link, Placeholder, StarterKit }
