<template>
  <div class="-mx-4 bg-white px-4 py-8 shadow-sm ring-1 ring-gray-900/5 sm:mx-0 sm:rounded-lg sm:px-8 sm:pb-14 lg:col-span-2 lg:row-span-2 lg:row-end-2 xl:px-16 xl:pb-20 xl:pt-16">
    <h2 class="text-base font-semibold text-gray-800">Professional Background</h2>
    <dl class="mt-6 grid grid-cols-1 text-sm/6 sm:grid-cols-2">
      <div class="sm:pr-4">
        <dt class="inline text-gray-600">Education</dt>
        <dd class="inline text-gray-700">J.D., Stanford Law School</dd>
      </div>
      <div class="mt-2 sm:mt-0 sm:pl-4">
        <dt class="inline text-gray-600">Bar Admission</dt>
        <dd class="inline text-gray-700">California, 2005</dd>
      </div>
      <div class="mt-6 border-t border-gray-900/5 pt-6 sm:pr-4">
        <dt class="font-semibold text-gray-800">Previous Experience</dt>
        <dd class="mt-2 text-gray-600">
          <span class="font-medium text-gray-800">Senior Partner, Johnson & Associates</span><br>
          Criminal Defense Attorney<br>
          2005-2020
        </dd>
      </div>
      <div class="mt-8 sm:mt-6 sm:border-t sm:border-gray-900/5 sm:pl-4 sm:pt-6">
        <dt class="font-semibold text-gray-800">Notable Achievements</dt>
        <dd class="mt-2 text-gray-600">
          <span class="font-medium text-gray-800">California Bar Association</span><br>
          Excellence in Legal Practice Award<br>
          2018
        </dd>
      </div>
    </dl>
    <div class="mt-16">
      <h3 class="text-base font-semibold text-gray-800">Recent Cases</h3>
      <table class="mt-6 w-full whitespace-nowrap text-left text-sm/6">
        <colgroup>
          <col class="w-full">
          <col>
          <col>
        </colgroup>
        <thead class="border-b border-gray-200 text-gray-800">
          <tr>
            <th scope="col" class="px-0 py-3 font-semibold">Case Name</th>
            <th scope="col" class="hidden py-3 pl-8 pr-0 text-right font-semibold sm:table-cell">Year</th>
            <th scope="col" class="py-3 pl-8 pr-0 text-right font-semibold">Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-b border-gray-100">
            <td class="max-w-0 px-0 py-5 align-top">
              <div class="truncate font-medium text-gray-800">State v. Johnson</div>
              <div class="truncate text-gray-600">Criminal case involving complex evidence handling</div>
            </td>
            <td class="hidden py-5 pl-8 pr-0 text-right align-top tabular-nums text-gray-700 sm:table-cell">2023</td>
            <td class="py-5 pl-8 pr-0 text-right align-top tabular-nums text-gray-700">Guilty</td>
          </tr>
          <tr class="border-b border-gray-100">
            <td class="max-w-0 px-0 py-5 align-top">
              <div class="truncate font-medium text-gray-800">Smith Family Trust</div>
              <div class="truncate text-gray-600">Complex family law dispute resolution</div>
            </td>
            <td class="hidden py-5 pl-8 pr-0 text-right align-top tabular-nums text-gray-700 sm:table-cell">2023</td>
            <td class="py-5 pl-8 pr-0 text-right align-top tabular-nums text-gray-700">Settled</td>
          </tr>
          <tr class="border-b border-gray-100">
            <td class="max-w-0 px-0 py-5 align-top">
              <div class="truncate font-medium text-gray-800">City v. Development Corp</div>
              <div class="truncate text-gray-600">Land use and zoning dispute</div>
            </td>
            <td class="hidden py-5 pl-8 pr-0 text-right align-top tabular-nums text-gray-700 sm:table-cell">2022</td>
            <td class="py-5 pl-8 pr-0 text-right align-top tabular-nums text-gray-700">Appealed</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">

</script>