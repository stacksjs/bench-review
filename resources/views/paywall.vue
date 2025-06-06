<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Toaster, notification } from '@stacksjs/notification'

const router = useRouter()
const isLoading = ref(false)

async function handleSubscribe() {
  isLoading.value = true
  try {
    // TODO: Implement actual Stripe subscription
    // This is where we'll integrate with the backend subscription endpoint
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulated API call
    notification('Subscription successful!')
    router.push('/dashboard')
  }
  catch (error) {
    notification('Failed to process subscription. Please try again.')
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-off-white py-16 sm:py-24 lg:py-32">
    <div class="mx-auto max-w-2xl px-6 lg:px-8">
      <div class="text-center">
        <h1 class="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">Upgrade Your Experience</h1>
        <p class="mt-6 text-lg leading-8 text-gray-600">
          Get unlimited access to all features and help build a more transparent judicial system.
        </p>
      </div>

      <div class="mt-16 rounded-3xl bg-white p-8 ring-1 ring-gray-200 lg:p-12">
        <div class="flex flex-col items-center">
          <div class="flex items-baseline gap-x-2">
            <span class="text-5xl font-bold tracking-tight text-gray-900">$10</span>
            <span class="text-sm font-semibold leading-6 text-gray-600">/month</span>
          </div>
          
          <ul role="list" class="mt-10 space-y-4 text-sm/6 text-gray-600">
            <li class="flex gap-x-3">
              <svg class="h-6 w-5 flex-none text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
              </svg>
              Unlimited judge reviews
            </li>
            <li class="flex gap-x-3">
              <svg class="h-6 w-5 flex-none text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
              </svg>
              Advanced analytics and insights
            </li>
            <li class="flex gap-x-3">
              <svg class="h-6 w-5 flex-none text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
              </svg>
              Priority support
            </li>
            <li class="flex gap-x-3">
              <svg class="h-6 w-5 flex-none text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
              </svg>
              Early access to new features
            </li>
          </ul>

          <button
            @click="handleSubscribe"
            :disabled="isLoading"
            class="mt-10 block w-full rounded-sm bg-gray-600 px-3 py-3 text-center text-sm font-semibold text-white shadow hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Processing...</span>
            <span v-else>Subscribe Now</span>
          </button>

          <p class="mt-4 text-sm text-gray-500">
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
    <Toaster position="top-right" />
  </div>
</template> 