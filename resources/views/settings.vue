<template>
  <div class="min-h-screen">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="space-y-10 divide-y divide-gray-900/10">
        <div class="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-3">
          <div class="px-4 sm:px-0">
            <h2 class="text-base font-semibold leading-7 text-gray-800">Settings</h2>
            <p class="mt-1 text-sm leading-6 text-gray-600">Update your account settings and profile information.</p>
          </div>

          <form class="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
            <div class="px-4 py-6 sm:p-8">
              <div class="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                <!-- Name Change -->
                <div class="col-span-full">
                  <h3 class="text-base font-semibold leading-7 text-gray-800">Personal Information</h3>
                  <div class="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6">
                    <div class="sm:col-span-3">
                      <label for="first-name" class="block text-sm font-medium leading-6 text-gray-700">First name</label>
                      <div class="mt-2">
                        <input 
                          type="text" 
                          name="first-name" 
                          id="first-name" 
                          v-model="firstName"
                          class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-sm sm:leading-6" 
                        />
                      </div>
                    </div>

                    <div class="sm:col-span-3">
                      <label for="last-name" class="block text-sm font-medium leading-6 text-gray-700">Last name</label>
                      <div class="mt-2">
                        <input 
                          type="text" 
                          name="last-name" 
                          id="last-name" 
                          v-model="lastName"
                          class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-sm sm:leading-6" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Profile Picture -->
                <div class="col-span-full">
                  <label for="photo" class="block text-sm font-medium leading-6 text-gray-700">Photo</label>
                  <div class="mt-2 flex items-center gap-x-3">
                    <img class="h-12 w-12 rounded-full" src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="" />
                    <button type="button" class="rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Change</button>
                  </div>
                </div>

                <!-- Password Update -->
                <div class="col-span-full">
                  <h3 class="text-base font-semibold leading-7 text-gray-800">Update Password</h3>
                  <div class="mt-4 space-y-4">
                    <div>
                      <label for="current-password" class="block text-sm font-medium leading-6 text-gray-700">Current Password</label>
                      <div class="mt-2">
                        <input type="password" name="current-password" id="current-password" class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-sm sm:leading-6" />
                      </div>
                    </div>

                    <div>
                      <label for="new-password" class="block text-sm font-medium leading-6 text-gray-700">New Password</label>
                      <div class="mt-2">
                        <input type="password" name="new-password" id="new-password" class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-sm sm:leading-6" />
                      </div>
                    </div>

                    <div>
                      <label for="confirm-password" class="block text-sm font-medium leading-6 text-gray-700">Confirm New Password</label>
                      <div class="mt-2">
                        <input type="password" name="confirm-password" id="confirm-password" class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-sm sm:leading-6" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-end gap-x-6 border-t border-gray-900/10 px-4 py-4 sm:px-8">
              <button type="button" class="text-sm font-semibold leading-6 text-gray-700">Cancel</button>
              <button type="submit" class="rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const firstName = ref('John')
const lastName = ref('Doe')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const handleSubmit = () => {
  // Handle form submission
  console.log('Form submitted', {
    firstName: firstName.value,
    lastName: lastName.value,
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
    confirmPassword: confirmPassword.value
  })
}
</script> 