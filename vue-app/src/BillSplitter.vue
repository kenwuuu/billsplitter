<template>
  <div class="bill-splitter-app">
    <div v-if="showTipPopup" id="overlay" @click="closePopup"></div>
    <div v-if="showTipPopup" id="popup">
      <h3><b>Tip! 💡</b></h3>
      <p>If no one is selected in the <b>Split With</b> column, the item will be split with everyone.</p>
      <label>
        <input type="checkbox" v-model="dontShowAgain" /> Don't show this again
      </label>
      <button @click="closePopup">Close</button>
    </div>

    <h1>Bill Splitting Utility</h1>
    <h4><a href="http://kenwuuu.github.io/">Tools</a> by: <a href="https://github.com/kenwuuu/" target="_blank">Ken</a></h4>

    <div class="input-section">
      <form autocomplete="off" @submit.prevent="addPerson">
        <input
          type="text"
          v-model="newPersonName"
          placeholder="Person name to split with"
          class="wide-input"
          autocomplete="off"
        />
        <button type="submit" style="display: none;">Add Person</button>
      </form>
    </div>

    <div class="input-section">
      <form v-if="showManualItemInput" autocomplete="off" @submit.prevent="addMenuItem">
        <input
          type="text"
          v-model="newMenuItemName"
          placeholder="Item name"
          class="wide-input mb-4"
          autocomplete="off"
        />
        <button type="submit" style="display: none;">Add Item</button>
      </form>

      <button @click="showManualItemInput = !showManualItemInput" class="secondary-action-btn mr-4">Manually add items</button>

      <div v-if="uploadError" class="error-text">{{ uploadError }}</div>
      <div v-if="isUploading">Processing receipt... 🤖</div>
      <label v-else class="upload-label">
        <input type="file" @change="handleReceiptUpload" accept="image/*" capture="environment" style="display: none;" />
        📤 Upload Receipt
      </label>
    </div>

    <div id="person-list" class="person-checkboxes">
      <span v-if="persons.length === 0">No people added yet.</span>
      <strong v-else>Guests:</strong>
      <span v-for="person in persons" :key="person" class="person-tag">{{ person }}</span>
    </div>

    <table>
      <thead>
      <tr>
        <th>Item & Price</th>
        <th class="split-with-cell">
          Split With
          <div class="tooltip-container">
            <button @click="showSplitTooltip = !showSplitTooltip" class="tooltip-trigger">?⃝</button>
            <span v-if="showSplitTooltip" class="tooltip-text">
                    Check names to split an item. If no one is checked, it's split with everyone.
                </span>
          </div>
        </th>
        <th>🗑</th>
      </tr>
      </thead>
      <tbody>
      <tr v-if="billItems.length === 0">
        <td colspan="3" style="text-align: center;">Add items to get started!</td>
      </tr>
      <tr v-for="item in billItems" :key="item.id">
        <td>
          <div class="item-price-wrapper">
            <input type="text" v-model="item.name" placeholder="Item Name" class="item-name-input"/>
            <div class="price-input-wrapper">
              <span class="price-prefix"></span>
              <input type="tel" :value="item.price" @input="event => formatPrice(item, event)" placeholder="0.00" class="price-input"/>
            </div>
          </div>
        </td>
        <td class="split-with-cell">
          <div class="split-checkboxes-wrapper">
            <label v-for="person in persons" :key="person" :title="person">
              <input type="checkbox" :value="person" v-model="item.splitWith" /> {{ person }}
            </label>
          </div>
        </td>
        <td class="action-col">
          <button @click="removeItem(item.id)" class="remove-btn" title="Remove row">❌</button>
        </td>
      </tr>
      </tbody>
    </table>
    <button @click="addItemRow()" class="add-item-btn">+ Add Item Row</button>

    <h3 style="text-align: center;">Subtotal: ${{ subtotal.toFixed(2) }}</h3>

    <div class="input-section">
      <label for="total-input">Total (with tip & tax):</label>
      <input type="tel" id="total-input" :value="totalAmount" @input="formatTotal" placeholder="0.00" @keydown.enter="showSummary = true" />
    </div>

    <button @click="showSummary = true" :disabled="persons.length === 0">Calculate Split</button>

    <div v-if="showSummary" class="payment-summary-section">
      <h2>Payment Summary</h2>
      <h4>"Total Payment" includes each person's share of tip and tax.</h4>
      <table>
        <thead>
        <tr>
          <th>Person</th>
          <th>Total Payment</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(amount, person) in finalTotals" :key="person">
          <td>{{ person }}</td>
          <td>${{ amount }}</td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

***

<script setup>
import { ref, computed, onMounted, watch } from 'vue';

// --- STATE ---
const persons = ref([]);
const newPersonName = ref('');

const billItems = ref([]);
const newMenuItemName = ref('');
const showManualItemInput = ref(false);

const totalAmount = ref('');
const showSummary = ref(false);

const showTipPopup = ref(false);
const dontShowAgain = ref(false);
const showSplitTooltip = ref(false);

const uploadError = ref('');
const isUploading = ref(false);
let nextItemId = 0;

// --- COMPUTED PROPERTIES (Derived State) ---
const subtotal = computed(() => {
  return billItems.value.reduce((total, item) => total + (parseFloat(item.price) || 0), 0);
});

/**
 * Calculates the final payment for each person, including their share of tax and tip.
 */
const finalTotals = computed(() => {
  const sub = subtotal.value;
  const total = parseFloat(totalAmount.value) || sub; // Default to subtotal if total isn't entered
  if (sub === 0 || persons.value.length === 0) return {};

  const multiplier = total / sub; // The ratio of total to subtotal (for tax/tip)

  // Initialize a total for each person
  const personTotals = persons.value.reduce((acc, p) => ({ ...acc, [p]: 0 }), {});

  // Distribute the cost of each item
  billItems.value.forEach(item => {
    const price = parseFloat(item.price) || 0;
    if (price === 0) return;

    // If no one is checked for an item, split it among everyone. Otherwise, use checked people.
    const peopleSharing = item.splitWith.length > 0 ? item.splitWith : persons.value;
    if (peopleSharing.length === 0) return;

    const share = price / peopleSharing.length;
    peopleSharing.forEach(person => {
      if (personTotals[person] !== undefined) personTotals[person] += share;
    });
  });

  // Apply the tax/tip multiplier to each person's total and format it
  const final = {};
  for (const person in personTotals) {
    final[person] = (personTotals[person] * multiplier).toFixed(2);
  }
  return final;
});

// --- METHODS ---

/**
 * Adds multiple people from a single space-separated string.
 */
function addPerson() {
  const names = newPersonName.value.trim().split(/\s+/).filter(Boolean);
  names.forEach(name => {
    if (!persons.value.includes(name)) {
      persons.value.push(name);
    }
  });
  newPersonName.value = '';
}

/**
 * Adds a new, empty row to the bill items table.
 */
function addItemRow(name = '', price = '') {
  billItems.value.push({
    id: nextItemId++,
    name,
    price: price.toString(),
    splitWith: [] // This array will be populated by the checkboxes via v-model
  });
}

/**
 * Adds multiple items from a comma or period separated string.
 */
function addMenuItem() {
  const items = newMenuItemName.value.split(/[,.]/).map(item => item.trim()).filter(Boolean);
  items.forEach(item => addItemRow(item));
  newMenuItemName.value = '';
  // If the table was empty, add an extra blank row for convenience
  if (billItems.value.length === items.length && items.length > 0) {
    addItemRow();
  }
}

/**
 * Removes an item from the bill by its unique ID.
 */
function removeItem(itemId) {
  billItems.value = billItems.value.filter(item => item.id !== itemId);
}

/**
 * Formats a number input to two decimal places automatically.
 */
function formatPrice(item, event) {
  let value = event.target.value.replace(/[^0-9]/g, '');
  item.price = value ? (parseInt(value, 10) / 100).toFixed(2) : '';
}

/**
 * Formatter for the main Total field.
 */
function formatTotal(event) {
  let value = event.target.value.replace(/[^0-9]/g, '');
  totalAmount.value = value ? (parseInt(value, 10) / 100).toFixed(2) : '';
}

/**
 * Closes the informational popup and saves the user's preference if checked.
 */
function closePopup() {
  if (dontShowAgain.value) {
    localStorage.setItem('dontShowPopup', 'true');
  }
  showTipPopup.value = false;
}

/**
 * Handles the file upload, compression, and API call for receipt parsing.
 */
async function handleReceiptUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  uploadError.value = '';
  isUploading.value = true;

  try {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File is too large. Max 5MB.');
    }

    const compressedFile = await compressImage(file);
    const formData = new FormData();
    formData.append('image', compressedFile);

    const response = await fetch('https://receipt-parser.kenqiwu-1b0.workers.dev/parse_receipt/', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Failed to parse receipt. Please try again.');
    const data = await response.json();

    // Clear existing items and populate with parsed data
    billItems.value = [];
    data.line_items.forEach(item => addItemRow(item.name, item.price.toFixed(2)));
    if (data.total_amount) totalAmount.value = data.total_amount.toFixed(2);
  } catch (err) {
    uploadError.value = err.message;
  } finally {
    isUploading.value = false;
    event.target.value = ''; // Reset file input
  }
}

/**
 * Compresses an image file using a canvas before uploading.
 */
function compressImage(file, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}


// --- WATCHERS (Reacting to State Changes) ---

/**
 * When the list of persons changes (e.g., someone is removed), this ensures they
 * are also removed from any items they were splitting.
 */
watch(persons, (newPersonsList) => {
  const newPersonsSet = new Set(newPersonsList);
  billItems.value.forEach(item => {
    item.splitWith = item.splitWith.filter(p => newPersonsSet.has(p));
  });
}, { deep: true });

// --- LIFECYCLE HOOKS ---

/**
 * Runs once after the component is mounted to the DOM.
 */
onMounted(() => {
  // Check if the user has previously opted out of the tip popup.
  if (!localStorage.getItem('dontShowPopup')) {
    showTipPopup.value = true;
  }
  // Start with one empty row for the user.
  addItemRow();
});
</script>

***

<style>
/* You can place the contents of your styles.css file here. Scoped styles are also possible. */
:root {
  --primary-bg: #f4f4f9;
  --text-color: #333;
  --border-color: #ddd;
  --button-bg: #007bff;
  --button-hover-bg: #0056b3;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--primary-bg);
  color: var(--text-color);
  margin: 0;
  padding: 10px;
}
.bill-splitter-app {
  max-width: 800px;
  margin: auto;
  background: white;
  padding: 25px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1, h2, h3, h4 {
  text-align: center;
  color: var(--header-color);
}
h4 {
  font-weight: normal;
  color: #666;
}
h4 a {
  color: #007bff;
  text-decoration: none;
}
h4 a:hover {
  text-decoration: underline;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}
th, td {
  border: 1px solid var(--border-color);
  padding: 12px;
  text-align: left;
  vertical-align: top;
}
th { background-color: #f8f9fa; }

/* Combined Item & Price Input Styles */
.item-price-wrapper {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.item-name-input, .price-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

/* Responsive "Split With" column */
.split-with-cell { width: 45%; }
.split-checkboxes-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.split-checkboxes-wrapper label {
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.9em;
}

/* Compact Remove Button */
.action-col { width: 40px; text-align: center; vertical-align: middle; }
.remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  padding: 0;
  line-height: 1;
}

/* Tooltip */
.tooltip-container {
  display: inline-block;
  position: relative;
  margin-left: 4px;
}
.tooltip-trigger {
  background: #e9ecef;
  border: 1px solid #ced4da;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 20px;
  font-size: 12px;
}
.tooltip-text {
  visibility: visible;
  width: 200px;
  background-color: #333;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 8px;
  position: absolute;
  z-index: 1;
  bottom: 125%;
  left: 50%;
  margin-left: -100px;
  opacity: 1;
  transition: opacity 0.3s;
}
.tooltip-text::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #333 transparent transparent transparent;
}

/* General Input & Button Styles */
.input-section { text-align: center; margin-bottom: 20px; }
#total-input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
.wide-input { padding: 10px; width: 70%; max-width: 400px; border: 1px solid #ccc; border-radius: 4px; }
button, .upload-label { background-color: var(--button-bg); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 1em; transition: background-color 0.2s; display: inline-block; }
button:hover, .upload-label:hover { background-color: var(--button-hover-bg); }
button:disabled { background-color: #aaa; cursor: not-allowed; }
.secondary-action-btn { background: #6c757d; margin-left: 10px; }
.secondary-action-btn:hover { background: #5a6268; }
.add-item-btn { display: block; margin: 10px auto 20px; background-color: #28a745; }
.add-item-btn:hover { background-color: #218838; }

.person-checkboxes { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 20px; padding: 10px; border-radius: 5px; background: #f8f9fa; }
.person-tag { background: #e9ecef; padding: 5px 10px; border-radius: 15px; font-size: 0.9em; }
.payment-summary-section { margin-top: 30px; padding-top: 20px; border-top: 2px solid var(--border-color); }
.payment-summary-section table { width: 80%; margin: 0 auto; }
.error-text { color: red; margin-bottom: 10px; }

/* Popup Styles */
#overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 999; }
#popup { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 320px; border: 1px solid black; padding: 25px; background: white; text-align: center; z-index: 1000; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
#popup p { margin: 15px 0; }
#popup label { display: block; margin-bottom: 15px; }
#popup button { width: 100%; }

/* Mobile Responsive Adjustments */
@media (max-width: 768px) {
  .bill-splitter-app { padding: 10px; }
  .split-with-cell { width: 50%; min-width: 140px; }
  .split-checkboxes-wrapper label { font-size: 0.85em; }
  td { padding: 8px 4px; }
  .payment-summary-section table { width: 100%; }
}
</style>
