<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Highlight from '@tiptap/extension-highlight'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import Blockquote from '@tiptap/extension-blockquote'
import ListItem from '@tiptap/extension-list-item'
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// Initialize Tiptap editor
const editor = useEditor({
  content: props.modelValue,
  extensions: [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    BulletList,
    OrderedList,
    ListItem,
    Blockquote,
    Highlight.configure({
      multicolor: true,
    }),
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-sm focus:outline-none max-w-none',
    },
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  }
})

// Cleanup editor on component unmount
onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div class="block w-full rounded-md bg-off-white text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-gray-600">
    <!-- Editor Menu Bar -->
    <div class="border-b border-gray-200 px-3 py-2 flex flex-wrap gap-2">
      <!-- Text Style -->
      <button
        type="button"
        @click="editor?.chain().focus().toggleBold().run()"
        :class="{ 'bg-gray-200': editor?.isActive('bold') }"
        class="rounded p-1.5 hover:bg-gray-100"
        title="Bold"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5">
          <path fill="none" d="M0 0h24v24H0z"/>
          <path d="M8 11h4.5a2.5 2.5 0 1 0 0-5H8v5zm10 4.5a2.5 2.5 0 0 1-2.5 2.5H8V13h7.5a2.5 2.5 0 0 1 2.5 2.5z"/>
        </svg>
      </button>

      <button
        type="button"
        @click="editor?.chain().focus().toggleItalic().run()"
        :class="{ 'bg-gray-200': editor?.isActive('italic') }"
        class="rounded p-1.5 hover:bg-gray-100"
        title="Italic"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5">
          <path fill="none" d="M0 0h24v24H0z"/>
          <path d="M15 20H7v-2h2.927l2.116-12H9V4h8v2h-2.927l-2.116 12H15z"/>
        </svg>
      </button>

      <span class="w-px h-6 bg-gray-200 mx-1"></span>

      <!-- Lists -->
      <button
        type="button"
        @click="editor?.chain().focus().toggleBulletList().run()"
        :class="{ 'bg-gray-200': editor?.isActive('bulletList') }"
        class="rounded p-1.5 hover:bg-gray-100"
        title="Bullet List"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5">
          <path fill="none" d="M0 0h24v24H0z"/>
          <path d="M8 4h13v2H8V4zM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 11h13v2H8v-2zm0 7h13v2H8v-2z"/>
        </svg>
      </button>

      <button
        type="button"
        @click="editor?.chain().focus().toggleOrderedList().run()"
        :class="{ 'bg-gray-200': editor?.isActive('orderedList') }"
        class="rounded p-1.5 hover:bg-gray-100"
        title="Numbered List"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5">
          <path fill="none" d="M0 0h24v24H0z"/>
          <path d="M8 4h13v2H8V4zM5 3v3h1v1H3V6h1V4H3V3h2zm2 8h13v2H7v-2zm-3-3h1.5v3.5H3v-1h1V8zm-1 7v-1h2v3H3v-1h1v-.5H3v-1h1V15H3zm4 1h13v2H7v-2z"/>
        </svg>
      </button>

      <span class="w-px h-6 bg-gray-200 mx-1"></span>

      <!-- Highlight -->
      <button
        type="button"
        @click="editor?.chain().focus().toggleHighlight().run()"
        :class="{ 'bg-gray-200': editor?.isActive('highlight') }"
        class="rounded p-1.5 hover:bg-gray-100"
        title="Highlight"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5">
          <path fill="none" d="M0 0h24v24H0z"/>
          <path d="M15.243 4.515l-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.829 1.04-1.041 2.122-.707 6.737-6.738-4.242-4.242zm6.364 3.535a1 1 0 0 1 0 1.414l-7.779 7.779-2.12.707-1.415 1.414a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414l1.414-1.414.707-2.121 7.779-7.779a1 1 0 0 1 1.414 0l5.657 5.657zm-6.364-.707l1.414 1.414-4.95 4.95-1.414-1.414 4.95-4.95zM4.283 16.89l2.828 2.829-1.414 1.414-4.243-1.414 2.828-2.829z"/>
        </svg>
      </button>

      <span class="w-px h-6 bg-gray-200 mx-1"></span>

      <!-- Blockquote -->
      <button
        type="button"
        @click="editor?.chain().focus().toggleBlockquote().run()"
        :class="{ 'bg-gray-200': editor?.isActive('blockquote') }"
        class="rounded p-1.5 hover:bg-gray-100"
        title="Quote"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5">
          <path fill="none" d="M0 0h24v24H0z"/>
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/>
        </svg>
      </button>
    </div>

    <div class="px-3 py-2">
      <editor-content :editor="editor" />
    </div>
  </div>
</template>

<style>
.ProseMirror {
  min-height: 150px;
}

.ProseMirror:focus {
  outline: none;
}

.ProseMirror p:first-child {
  margin-top: 0;
}

.ProseMirror p.is-empty:first-child::before {
  color: #9ca3af;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Basic editor styles */
.ProseMirror > * + * {
  margin-top: 0.75em;
}

.ProseMirror ul,
.ProseMirror ol {
  padding: 0 1rem;
}

.ProseMirror ul {
  list-style-type: disc;
}

.ProseMirror ol {
  list-style-type: decimal;
}

.ProseMirror blockquote {
  padding-left: 1rem;
  border-left: 2px solid rgba(13, 13, 13, 0.1);
}
</style> 