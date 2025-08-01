<script setup lang="ts">
import type { Judge } from '@/types/bench';

const props = defineProps<{
  judge: Judge
}>()

const judge = props.judge

const showCopiedFeedback = ref(false)

const shareProfile = async () => {
  const url = window.location.href
  const title = 'Judge Profile'
  
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        url,
      })
    } catch (err) {
      // User cancelled or share failed
      console.error('Error sharing:', err)
    }
  } else {
    // Fallback to copy
    navigator.clipboard.writeText(url)
    showCopiedFeedback.value = true
    setTimeout(() => {
      showCopiedFeedback.value = false
    }, 2000)
  }
}
</script>

<template>
  <header class="relative isolate pt-16">
      <div class="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div class="absolute inset-x-0 bottom-0 h-px bg-gray-900/5"></div>
      </div>

    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-x-8 lg:mx-0 lg:max-w-none">
        <div class="flex items-center gap-x-6">
          <img src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="" class="size-16 flex-none rounded-full ring-1 ring-gray-900/10 filter grayscale">
          <h1>
            <div class="text-sm/6 text-gray-500">Judge <span class="text-gray-700">#12345</span></div>
            <div class="mt-1 text-base font-semibold text-gray-900">Hon. Sarah Johnson</div>
          </h1>
        </div>
        <div class="flex items-center gap-x-4 sm:gap-x-6">
          <button 
            type="button" 
            class="hidden text-sm/6 font-semibold text-gray-900 sm:block"
            @click="shareProfile"
          >
            {{ showCopiedFeedback ? 'Copied!' : 'Share Profile' }}
          </button>
          <router-link :to="`/review/judge/${judge.id}`" class="hidden text-sm/6 font-semibold text-gray-900 sm:block">Write Review</router-link>
          <a href="#" class="rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600">Follow</a>

          <div class="relative sm:hidden">
            <button type="button" class="-m-3 block p-3" id="more-menu-button" aria-expanded="false" aria-haspopup="true">
              <span class="sr-only">More</span>
              <svg class="size-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" data-slot="icon">
                <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
              </svg>
            </button>

            <div class="absolute right-0 z-10 mt-0.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none" role="menu" aria-orientation="vertical" aria-labelledby="more-menu-button" tabindex="-1">
              <button type="button" class="block w-full px-3 py-1 text-left text-sm/6 text-gray-900" role="menuitem" tabindex="-1" id="more-menu-item-0" @click="shareProfile">Share Profile</button>
              <router-link to="/review" class="block px-3 py-1 text-sm/6 text-gray-900" role="menuitem" tabindex="-1" id="more-menu-item-1">Write Review</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>