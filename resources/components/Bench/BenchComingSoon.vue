<script setup lang="ts">
import { Toaster, notification } from '@stacksjs/notification'

interface ApiError {
  errors: Array<{
    message: string;
  }>;
}

// Reactive state for the email input
const email = ref('')
const loading = ref(false)

// Method to handle email submission
async function submitEmail() {
  const body = {
    email: email.value,
  }

  const url = 'http://localhost:3008/api/email/subscribe'

  loading.value = true

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errs = await response.json() as ApiError
      notification.error(errs.errors[0]?.message || 'An error occurred. Please try again.')
    }
    else {
      notification.success('Thanks! Stay tuned for more updates.')
    }
  } catch (error) {
    notification.error('An error occurred. Please try again.')
  }

  email.value = ''
  loading.value = false
}
</script>

<template>
  <div class="relative isolate overflow-hidden bg-off-white min-h-[calc(100vh-80px)]">
    <div class="mx-auto max-w-7xl px-6 pb-16 pt-10 lg:flex lg:px-8 lg:py-16 sm:pb-24">
      <div class="mx-auto max-w-2xl lg:mx-0 lg:max-w-2xl lg:flex-shrink-0">
        <div class="mt-24 lg:mt-16 sm:mt-32">
          <a href="#" class="inline-flex space-x-6">
            <span
              class="rounded-full bg-gray-600/10 px-3 py-1 text-sm text-gray-600 font-semibold leading-6 ring-1 ring-gray-600/10 ring-inset">Coming
              soon</span>
          </a>
        </div>

        <h1 class="mt-12 text-4xl text-gray-900 font-bold tracking-tight sm:text-6xl">
          Transparency in the US Chambers of Secrets
        </h1>

        <blockquote class="mt-8 border-l-4 border-gray-300 pl-4 italic ml-4">
          <p class="text-gray-700 leading-8">
            "Publicity is justly commended as a remedy for social and industrial diseases. Sunlight is said to be the
            best of disinfectants; electric light the most efficient policeman."
          </p>
          <footer class="mt-2 text-sm text-gray-500">
            — Justice Louis D. Brandeis, "What Publicity Can Do," 1913
          </footer>
        </blockquote>

        <p class="mt-8 text-lg text-gray-600 leading-8">
          Like Glassdoor but for the judiciary. Written by clerks, so you can get a glimpse into
          the inner workings of the court system.
        </p>

        <div class="mt-12">
          <form @submit.prevent="submitEmail" class="flex max-w-md gap-x-4">
            <div class="relative flex-auto">
              <input type="email" v-model="email" placeholder="Enter your email" required :disabled="loading"
                class="block w-full bg-off-gray rounded-md border-0 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-sm sm:leading-6">
            </div>
            <button type="submit" :disabled="loading"
              class="flex-none rounded-md bg-gray-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600">
              {{ loading ? 'Subscribing...' : 'Notify me' }}
            </button>
          </form>
        </div>
      </div>
      <div class="mx-auto mt-16 flex lg:ml-10 lg:mr-0 lg:mt-0 sm:mt-24 xl:ml-32">
        <div class="max-w-3xl flex-none sm:max-w-5xl">
          <div class="rounded-xl p-2 lg:rounded-2xl lg:p-4">
            <img src="/images/bench/hero-image.webp"
              alt="Illustration of the U.S. Supreme Court building at night with a warm, golden glow and subtle magical ambiance. The neoclassical architecture is highlighted under a twilight sky with soft, swirling clouds, evoking a slightly mystical, storybook atmosphere."
              class="w-[50rem] rounded-lg object-cover">
          </div>
        </div>
      </div>
    </div>
  </div>
  <Toaster position="top-right" />
</template>