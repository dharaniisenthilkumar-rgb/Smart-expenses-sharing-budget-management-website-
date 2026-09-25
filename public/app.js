const state = {
  currentUser: null,
  groups: [],
  expenses: [],
  intelligence: {},
  currentGroupId: null,
  currentPage: "dashboard",
  editingExpenseId: null,
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function getInitials(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U"
  );
}

function getMemberColor(name = "") {
  const palette = [
    "#2563eb",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
    "#0ea5e9",
  ];
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function getCurrentIntelligence() {
  return state.intelligence[state.currentGroupId] || null;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function renderSmartDashboard() {
  const intelligence = getCurrentIntelligence();
  const status = document.getElementById("dashboardBudgetStatus");
  const metrics = document.getElementById("dashboardBudgetMetrics");
  const insight = document.getElementById("dashboardSmartInsight");
  const alerts = document.getElementById("dashboardUnusualAlerts");
  if (!status || !metrics || !insight || !alerts) return;

  if (!intelligence) {
    status.textContent = "Select a group to see live budget intelligence.";
    metrics.innerHTML = "";
    insight.textContent = "Add expenses to generate spending insights.";
    alerts.innerHTML = "";
    return;
  }

  status.className = `smart-status ${intelligence.budgetStatus.tone}`;
  status.innerHTML = `<strong>${intelligence.budgetStatus.label}</strong><span>${intelligence.budgetStatus.message}</span>`;
  metrics.innerHTML = `
    <div><span>Budget</span><strong>${formatCurrency(intelligence.totalBudget)}</strong></div>
    <div><span>Spent</span><strong>${formatCurrency(intelligence.totalSpent)}</strong></div>
    <div><span>Remaining</span><strong>${formatCurrency(intelligence.remainingBudget)}</strong></div>
    <div><span>Usage</span><strong>${formatPercent(intelligence.usagePercentage)}</strong></div>`;
  insight.textContent = intelligence.spendingInsight;
  alerts.innerHTML = intelligence.unusualExpenses.length
    ? intelligence.unusualExpenses.map((item) => `<div class="alert unusual-alert"><strong>Unusual Expense Detected</strong><span>${item.description} is ${formatCurrency(item.amount)}. ${item.message}</span></div>`).join("")
    : '<div class="page-subtitle smart-empty">No unusual expenses detected.</div>';
}

function setPage(pageName) {
  state.currentPage = pageName;
  document
    .querySelectorAll(".page")
    .forEach((node) => node.classList.add("hidden"));
  const page = document.getElementById(`${pageName}Page`);
  if (page) page.classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === pageName;
    link.classList.toggle("active", active);
  });

  const titles = {
    dashboard: "Dashboard",
    groups: "Groups",
    expenses: "Expenses",
    settlements: "Settlements",
    budget: "Budget",
    analytics: "Analytics",
  };

  document.getElementById("pageTitle").textContent =
    titles[pageName] || "Dashboard";
}

function openModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

function populateExpensePayers() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const paidBySelect = document.getElementById("expensePaidBy");
  if (!paidBySelect || !group) return;

  paidBySelect.innerHTML = group.members
    .map((member) => `<option value="${member.id}">${member.name}</option>`)
    .join("");
}

function resetExpenseModal() {
  state.editingExpenseId = null;
  const modalTitle = document.querySelector(".modal-title");
  if (modalTitle) {
    modalTitle.textContent = "Add Expense";
  }
  const addExpenseSubmit = document.getElementById("addExpenseSubmit");
  if (addExpenseSubmit) {
    addExpenseSubmit.textContent = "Add Expense";
  }
  const description = document.getElementById("expenseDescription");
  const amount = document.getElementById("expenseAmount");
  const category = document.getElementById("expenseCategory");
  const dateField = document.getElementById("expenseDate");

  if (description) description.value = "";
  if (amount) amount.value = "";
  if (category) category.value = "Food";
  if (dateField) dateField.value = new Date().toISOString().slice(0, 10);

  populateExpensePayers();
}

function showNotification(message, isError = false) {
  alert(message);
  if (isError) console.error(message);
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("smartsplitToken");
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers && typeof options.headers === "object"
        ? options.headers
        : {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("smartsplitToken");
      window.location.reload();
      return;
    }
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function showApp(user) {
  state.currentUser = user;
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("appContainer").classList.remove("hidden");

  document.getElementById("userName").textContent = user.name;
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("dashboardUserName").textContent = user.name;
  document.getElementById("userAvatar").textContent =
    user.avatar || getInitials(user.name);
}

async function login(email, password) {
  if (!email || !password) {
    showNotification("Please enter email and password.");
    return;
  }

  try {
    const data = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("smartsplitToken", data.token);
    showApp(data.user);
    await loadAllData();
    setPage("dashboard");
  } catch (error) {
    showNotification(error.message, true);
  }
}

async function registerUser(name, email, password) {
  if (!name || !email || !password) {
    showNotification("Please complete all registration fields.");
    return;
  }

  try {
    const data = await apiFetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });

    localStorage.setItem("smartsplitToken", data.token);
    showApp(data.user);
    await loadAllData();
    setPage("dashboard");
  } catch (error) {
    showNotification(error.message, true);
  }
}

async function logout() {
  const token = localStorage.getItem("smartsplitToken");
  if (token) {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout request failed", error);
    }
  }

  localStorage.removeItem("smartsplitToken");
  state.currentUser = null;
  state.groups = [];
  state.expenses = [];
  state.currentGroupId = null;

  document.getElementById("appContainer").classList.add("hidden");
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("loginForm").reset();
  document.getElementById("registerForm").reset();
}

async function loadAllData() {
  const [groups, expenses] = await Promise.all([
    apiFetch("/api/groups"),
    apiFetch("/api/expenses"),
  ]);

  state.groups = groups;
  state.expenses = expenses;

  if (state.groups.length && !state.currentGroupId) {
    state.currentGroupId = state.groups[0].id;
  }

  const intelligenceEntries = await Promise.all(
    state.groups.map(async (group) => [
      group.id,
      await apiFetch(`/api/groups/${group.id}/intelligence`),
    ]),
  );
  state.intelligence = Object.fromEntries(intelligenceEntries);

  updateSelectedGroupPanel();
  renderDashboard();
  renderGroupsList();
  renderExpenseTable();
  renderSettlements();
  renderBudget();
  renderAnalytics();
  renderGroupDetail();
  renderSmartDashboard();
}

function updateSelectedGroupPanel() {
  const panel = document.getElementById("selectedGroupPanel");
  const group = state.groups.find((item) => item.id === state.currentGroupId);

  if (!group) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  document.getElementById("selectedGroupName").textContent = group.name;
  document.getElementById("selectedGroupMeta").textContent =
    `${group.members.length} members • ${group.currency}`;

  const container = document.getElementById("selectedGroupMembers");
  container.innerHTML = group.members
    .map((member) => {
      const initials = getInitials(member.name);
      const color = getMemberColor(member.name);
      return `
      <div class="member-card">
        <div class="member-info">
          <div class="member-avatar-small" style="background:${color};">${initials}</div>
          <div>
            <div style="font-weight:700;">${member.name}</div>
            <div style="font-size:12px; color:#6b7280;">${member.id === group.createdBy ? "Creator" : "Member"}</div>
          </div>
        </div>
        <span class="member-pill ${member.role === "ADMIN" ? "admin" : "member"}">${member.role}</span>
      </div>
      `;
    })
    .join("");
}

function renderDashboard() {
  const totalSpent = state.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const balances = state.groups
    .flatMap((group) => state.intelligence[group.id]?.balances || [])
    .filter((balance) => balance.memberId === state.currentUser?.id);
  const youOwe = balances.reduce(
    (sum, balance) => sum + Math.max(0, -Number(balance.netBalance || 0)),
    0,
  );
  const youAreOwed = balances.reduce(
    (sum, balance) => sum + Math.max(0, Number(balance.netBalance || 0)),
    0,
  );

  document.getElementById("totalGroups").textContent = String(
    state.groups.length,
  );
  document.getElementById("totalSpending").textContent =
    formatCurrency(totalSpent);
  document.getElementById("youOwe").textContent = formatCurrency(youOwe);
  document.getElementById("youAreOwed").textContent =
    formatCurrency(youAreOwed);

  const recentGroups = state.groups
    .slice(0, 3)
    .map((group) => {
      const groupExpenses = state.expenses.filter(
        (expense) => expense.groupId === group.id,
      );
      const total = groupExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0,
      );
      return `
      <div class="expense-item" onclick="selectGroup('${group.id}'); setPage('expenses');" style="cursor:pointer;">
        <div style="font-weight:700; margin-bottom:4px;">${group.name}</div>
        <div style="font-size:12px; color:#6b7280;">${group.members.length} members • ${groupExpenses.length} expenses</div>
        <div style="margin-top:8px; font-weight:700; color:#2563eb;">${formatCurrency(total)}</div>
      </div>
    `;
    })
    .join("");

  document.getElementById("recentGroupsList").innerHTML =
    recentGroups || '<div class="page-subtitle">No groups yet</div>';

  document.getElementById("quickStats").innerHTML = `
    <div class="expense-item">
      <div class="page-subtitle">Total Expenses</div>
      <div style="font-size:30px; font-weight:700; color:#2563eb; margin-top:6px;">${state.expenses.length}</div>
    </div>
    <div class="expense-item">
      <div class="page-subtitle">Pending</div>
      <div style="font-size:30px; font-weight:700; color:#f59e0b; margin-top:6px;">${state.groups.reduce((sum, group) => sum + (state.intelligence[group.id]?.settlements?.length || 0), 0)}</div>
    </div>
  `;
}

function renderGroupsList() {
  const container = document.getElementById("groupsList");

  if (!state.groups.length) {
    container.innerHTML = '<div class="card">No groups yet.</div>';
    return;
  }

  container.innerHTML = state.groups
    .map((group) => {
      const groupExpenses = state.expenses.filter(
        (expense) => expense.groupId === group.id,
      );
      const totalSpent = groupExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0,
      );
      const usage =
        group.budget > 0
          ? Math.min(100, Math.round((totalSpent / group.budget) * 100))
          : 0;
      const memberStack = group.members
        .slice(0, 4)
        .map(
          (member) => `
      <div class="member-avatar-small" style="background:${getMemberColor(member.name)};">${getInitials(member.name)}</div>
    `,
        )
        .join("");

      return `
      <div class="group-card ${state.currentGroupId === group.id ? "selected" : ""}" onclick="selectGroup('${group.id}'); setPage('groupDetail');">
        <div class="group-panel-header" style="margin-bottom:10px;">
          <div style="font-size:24px;">👥</div>
          <button class="btn btn-secondary" style="padding:8px 10px;" onclick="event.stopPropagation(); state.currentGroupId='${group.id}'; updateSelectedGroupPanel(); openModal('addMemberModal');">Add Member</button>
        </div>
        <div class="group-panel-header" style="margin-bottom: 10px;">
          <div style="font-weight:700; font-size:18px;">${group.name}</div>
          <span class="summary-chip">${usage}%</span>
        </div>
        <div class="page-subtitle" style="margin-bottom: 12px;">${group.description || "No description"}</div>
        <div class="group-panel-header" style="margin-bottom: 10px;">
          <span class="page-subtitle">Spent</span>
          <strong>${formatCurrency(totalSpent)}</strong>
        </div>
        <div class="member-stack">${memberStack}</div>
        <div style="margin-top:12px; height:8px; background:#e5e7eb; border-radius:10px; overflow:hidden;">
          <div style="height:100%; width:${usage}%; background:${usage < 70 ? "#10b981" : usage < 90 ? "#f59e0b" : "#ef4444"};"></div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderGroupDetail() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  if (!group) return;

  const groupExpenses = state.expenses.filter(
    (expense) => expense.groupId === group.id,
  );
  const spent = groupExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const remaining = Number(group.budget || 0) - spent;
  const usage = group.budget > 0 ? Math.round((spent / group.budget) * 100) : 0;

  document.getElementById("groupDetailTitle").textContent = group.name;
  document.getElementById("groupDetailSubtitle").textContent =
    `${group.members.length} members • ${group.currency}`;

  const stats = [
    { label: "Members", value: group.members.length, icon: "👥" },
    { label: "Total Spent", value: formatCurrency(spent), icon: "💸" },
    { label: "Remaining", value: formatCurrency(remaining), icon: "💰" },
    { label: "Usage", value: `${usage}%`, icon: "📊" },
  ];

  document.getElementById("groupDetailStats").innerHTML = stats
    .map(
      (stat) => `
    <div class="stat-card">
      <div class="stat-icon">${stat.icon}</div>
      <div class="stat-label">${stat.label}</div>
      <div class="stat-value">${stat.value}</div>
    </div>
  `,
    )
    .join("");

  document.getElementById("groupDetailMembers").innerHTML = group.members
    .map((member) => {
      const initials = getInitials(member.name);
      const color = getMemberColor(member.name);
      return `
      <div class="member-card" style="margin-bottom:10px;">
        <div class="member-info">
          <div class="member-avatar-small" style="background:${color};">${initials}</div>
          <div>
            <div style="font-weight:700;">${member.name}</div>
            <div style="font-size:12px; color:#6b7280;">${member.role}</div>
          </div>
        </div>
        ${member.id === group.createdBy ? "" : `<button class="mini-btn danger" onclick="removeMember('${member.id}')">Remove</button>`}
      </div>
    `;
    })
    .join("");

  document.getElementById("groupDetailExpenses").innerHTML =
    groupExpenses.length === 0
      ? '<div class="page-subtitle">No expenses yet.</div>'
      : groupExpenses
          .slice()
          .reverse()
          .map(
            (expense) => `
      <div class="expense-item">
        <div class="expense-top">
          <div>
            <div style="font-weight:700;">${expense.description}</div>
            <div class="expense-meta">${expense.category} • ${new Date(expense.date || Date.now()).toLocaleDateString()}</div>
          </div>
          <div class="expense-amount">${formatCurrency(expense.amount)}</div>
        </div>
        <div class="group-panel-header" style="margin-top:12px;">
          <span class="badge">${expense.splitType || "EQUAL"}</span>
          <div class="detail-actions">
            <button class="mini-btn" onclick="openEditExpense('${expense.id}')">Edit</button>
            <button class="mini-btn danger" onclick="deleteExpense('${expense.id}')">Delete</button>
          </div>
        </div>
      </div>
    `,
          )
          .join("");
}

function renderExpenseTable() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const container = document.getElementById("expensesList");

  if (!group) {
    container.innerHTML =
      '<div class="page-subtitle">Select a group first.</div>';
    return;
  }

  const groupExpenses = state.expenses.filter(
    (expense) => expense.groupId === group.id,
  );
  document.getElementById("expensesTitle").textContent =
    `${group.name} - Expenses`;

  if (!groupExpenses.length) {
    container.innerHTML =
      '<div class="page-subtitle" style="padding:40px 0; text-align:center;">No expenses yet.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Paid By</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${groupExpenses
            .map((expense) => {
              const paidBy =
                group.members.find((member) => member.id === expense.paidBy)
                  ?.name || "Unknown";
              return `
              <tr>
                <td>${expense.description}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td><span class="badge">${expense.category}</span></td>
                <td>${paidBy}</td>
                <td>${new Date(expense.date || Date.now()).toLocaleDateString()}</td>
                <td>
                  <div class="detail-actions">
                    <button class="mini-btn" onclick="openEditExpense('${expense.id}')">Edit</button>
                    <button class="mini-btn danger" onclick="deleteExpense('${expense.id}')">Delete</button>
                  </div>
                </td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettlements() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const memberBalances = document.getElementById("memberBalances");
  const settlementPlan = document.getElementById("settlementPlan");

  if (!group) {
    memberBalances.innerHTML = "";
    settlementPlan.innerHTML =
      '<div class="page-subtitle">Select a group.</div>';
    return;
  }

  const intelligence = getCurrentIntelligence();
  const balances = intelligence?.balances || [];
  const rows = balances.map((balance) => {
    const net = balance.totalPaid - balance.totalShare;
    const cssClass =
      net > 0
        ? "balance-positive"
        : net < 0
          ? "balance-negative"
          : "balance-neutral";
    return `
      <div class="member-card ${cssClass}">
        <div class="member-info">
          <div class="member-avatar-small" style="background:${getMemberColor(balance.name)};">${getInitials(balance.name)}</div>
          <div>
            <div style="font-weight:700;">${balance.name}</div>
            <div class="page-subtitle">${net > 0 ? "Should receive" : net < 0 ? "Should pay" : "Settled"}</div>
          </div>
        </div>
        <strong>${formatCurrency(Math.abs(net))}</strong>
      </div>
    `;
  });

  memberBalances.innerHTML = rows.join("");
  settlementPlan.innerHTML = intelligence?.settlements?.length
    ? `<div class="settlement-list">${intelligence.settlements.map((settlement) => `
      <div class="settlement-row">
        <div><strong>${settlement.fromName}</strong><span> pays </span><strong>${settlement.toName}</strong></div>
        <strong class="settlement-amount">${formatCurrency(settlement.amount)}</strong>
      </div>`).join("")}</div>`
    : '<div class="page-subtitle">No settlements available.</div>';
}

function renderBudget() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const container = document.getElementById("budgetDetails");
  if (!group) {
    container.innerHTML = '<div class="page-subtitle">Select a group.</div>';
    return;
  }

  const totalSpent = state.expenses
    .filter((expense) => expense.groupId === group.id)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remaining = group.budget - totalSpent;
  const percent =
    group.budget > 0 ? Math.round((totalSpent / group.budget) * 100) : 0;

  container.innerHTML = `
    <div class="expense-item">
      <div class="group-panel-header">
        <span class="page-subtitle">Budget</span>
        <strong>${formatCurrency(group.budget)}</strong>
      </div>
      <div class="group-panel-header" style="margin-top:12px;">
        <span class="page-subtitle">Spent</span>
        <strong>${formatCurrency(totalSpent)}</strong>
      </div>
      <div class="group-panel-header" style="margin-top:12px;">
        <span class="page-subtitle">Remaining</span>
        <strong>${formatCurrency(remaining)}</strong>
      </div>
      <div style="margin-top:14px; height:10px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
        <div style="height:100%; width:${Math.min(100, percent)}%; background:${percent < 70 ? "#10b981" : percent < 90 ? "#f59e0b" : "#ef4444"};"></div>
      </div>
    </div>
  `;

  updateSimulator();
}

function renderAnalytics() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const intelligence = getCurrentIntelligence();
  const groupExpenses = state.expenses.filter(
    (expense) => !group || expense.groupId === group.id,
  );
  const totalSpent = groupExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const average = groupExpenses.length
    ? Math.round(totalSpent / groupExpenses.length)
    : 0;
  const largest = groupExpenses.length
    ? Math.max(...groupExpenses.map((expense) => Number(expense.amount || 0)))
    : 0;

  document.getElementById("analyticsTotalSpending").textContent =
    formatCurrency(totalSpent);
  document.getElementById("analyticsExpenseCount").textContent = String(
    groupExpenses.length,
  );
  document.getElementById("analyticsAverage").textContent =
    formatCurrency(average);
  document.getElementById("analyticsLargest").textContent =
    formatCurrency(largest);

  const categoryContainer = document.getElementById("categoryBreakdown");
  const memberContainer = document.getElementById("memberContribution");
  const insightContainer = document.getElementById("analyticsInsight");
  const alertContainer = document.getElementById("analyticsUnusualAlerts");
  if (!categoryContainer || !memberContainer || !insightContainer || !alertContainer) return;

  categoryContainer.innerHTML = intelligence?.categoryBreakdown?.length
    ? intelligence.categoryBreakdown.map((item) => `
      <div class="breakdown-row">
        <div class="breakdown-label"><span>${item.category}</span><strong>${formatCurrency(item.amount)}</strong></div>
        <div class="breakdown-track"><div style="width:${Math.min(100, item.percentage)}%"></div></div>
        <div class="breakdown-percent">${formatPercent(item.percentage)}</div>
      </div>`).join("")
    : '<div class="page-subtitle">No category data yet.</div>';

  const contributions = {};
  groupExpenses.forEach((expense) => {
    contributions[expense.paidBy] = (contributions[expense.paidBy] || 0) + Number(expense.amount || 0);
  });
  memberContainer.innerHTML = group?.members?.length
    ? group.members.map((member) => {
      const amount = contributions[member.id] || 0;
      const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
      return `<div class="breakdown-row"><div class="breakdown-label"><span>${member.name}</span><strong>${formatCurrency(amount)}</strong></div><div class="breakdown-track"><div style="width:${Math.min(100, percentage)}%"></div></div><div class="breakdown-percent">${formatPercent(percentage)}</div></div>`;
    }).join("")
    : '<div class="page-subtitle">No member data yet.</div>';
  insightContainer.textContent = intelligence?.spendingInsight || "Add expenses to generate an insight.";
  alertContainer.innerHTML = intelligence?.unusualExpenses?.length
    ? intelligence.unusualExpenses.map((item) => `<div class="alert unusual-alert"><strong>Unusual Expense Detected</strong><span>${item.description}: ${item.message}</span></div>`).join("")
    : '<div class="page-subtitle smart-empty">No unusual expenses detected.</div>';
}

function updateSimulator() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const intelligence = getCurrentIntelligence();
  const result = document.getElementById("simulatorResult");
  const amountInput = document.getElementById("simulatorAmount");
  if (!group || !intelligence || !result || !amountInput) return;

  const proposed = Number(amountInput.value || 0);
  if (!Number.isFinite(proposed) || proposed < 0) {
    result.textContent = "Enter a valid non-negative amount.";
    return;
  }
  const projectedTotal = intelligence.totalSpent + proposed;
  const projectedRemaining = intelligence.totalBudget - projectedTotal;
  const projectedUsage = intelligence.totalBudget > 0
    ? (projectedTotal / intelligence.totalBudget) * 100
    : proposed > 0 ? 101 : 0;
  const resultLabel = projectedUsage > 100
    ? "This expense would exceed the group budget."
    : projectedUsage >= 70
      ? "Budget Warning"
      : "Within Budget";
  result.innerHTML = `<div class="simulator-result-grid"><span>Current Spending<strong>${formatCurrency(intelligence.totalSpent)}</strong></span><span>Proposed Expense<strong>${formatCurrency(proposed)}</strong></span><span>Projected Spending<strong>${formatCurrency(projectedTotal)}</strong></span><span>Projected Remaining<strong>${formatCurrency(projectedRemaining)}</strong></span><span>Projected Usage<strong>${formatPercent(projectedUsage)}</strong></span></div><div class="simulator-outcome ${projectedUsage > 100 ? "danger" : projectedUsage >= 70 ? "warning" : "success"}">${resultLabel}</div>`;
}

function selectGroup(groupId) {
  state.currentGroupId = groupId;
  updateSelectedGroupPanel();
  renderGroupsList();
  renderGroupDetail();
  renderExpenseTable();
  renderSettlements();
  renderBudget();
  renderSmartDashboard();
  renderAnalytics();
}

async function createGroup() {
  const name = document.getElementById("groupName").value.trim();
  const description = document.getElementById("groupDescription").value.trim();
  const currency = document.getElementById("groupCurrency").value;
  const budget = Number(document.getElementById("groupBudget").value || 0);

  if (!name) {
    showNotification("Please enter a group name.");
    return;
  }

  try {
    const created = await apiFetch("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name, description, currency, budget }),
    });

    state.currentGroupId = created.id;
    document.getElementById("createGroupModal").classList.add("hidden");
    document.getElementById("createGroupForm")?.reset?.();
    await loadAllData();
    setPage("groups");
  } catch (error) {
    showNotification(error.message, true);
  }
}

async function addMember() {
  const name = document.getElementById("memberNameInput").value.trim();
  const role = document.getElementById("memberRoleInput").value;

  if (!state.currentGroupId) return;
  if (!name) {
    showNotification("Please enter a member name.");
    return;
  }

  try {
    await apiFetch(`/api/groups/${state.currentGroupId}/members`, {
      method: "POST",
      body: JSON.stringify({ name, role }),
    });

    closeModal("addMemberModal");
    document.getElementById("memberNameInput").value = "";
    document.getElementById("memberRoleInput").value = "MEMBER";
    await loadAllData();
    setPage("groups");
  } catch (error) {
    showNotification(error.message, true);
  }
}

async function removeMember(memberId) {
  if (!state.currentGroupId) return;
  const confirmed = confirm("Remove this member from the group?");
  if (!confirmed) return;

  try {
    await apiFetch(`/api/groups/${state.currentGroupId}/members/${memberId}`, {
      method: "DELETE",
    });
    await loadAllData();
    setPage("groupDetail");
  } catch (error) {
    showNotification(error.message, true);
  }
}

async function createExpense() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  if (!group) return;

  const payload = {
    groupId: state.currentGroupId,
    description: document.getElementById("expenseDescription").value.trim(),
    amount: Number(document.getElementById("expenseAmount").value || 0),
    category: document.getElementById("expenseCategory").value,
    paidBy: document.getElementById("expensePaidBy").value,
    splitType: "EQUAL",
    participants: group.members.map((member) => member.id),
    date:
      document.getElementById("expenseDate").value ||
      new Date().toISOString().slice(0, 10),
  };

  if (!payload.description || payload.amount <= 0) {
    showNotification("Please enter a valid description and amount.");
    return;
  }

  try {
    await apiFetch("/api/expenses", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    closeModal("addExpenseModal");
    document.getElementById("expenseDescription").value = "";
    document.getElementById("expenseAmount").value = "";
    document.getElementById("expenseDate").value = "";
    await loadAllData();
    setPage("expenses");
  } catch (error) {
    showNotification(error.message, true);
  }
}

function openExpenseModal() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  if (!group) return;

  resetExpenseModal();
  openModal("addExpenseModal");
}

async function openEditExpense(expenseId) {
  const expense = state.expenses.find((item) => item.id === expenseId);
  if (!expense) return;

  const group = state.groups.find((item) => item.id === state.currentGroupId);
  if (!group) return;

  state.editingExpenseId = expenseId;
  document.getElementById("expenseDescription").value = expense.description;
  document.getElementById("expenseAmount").value = expense.amount;
  document.getElementById("expenseCategory").value = expense.category;
  document.getElementById("expenseDate").value =
    expense.date || new Date().toISOString().slice(0, 10);

  const paidBySelect = document.getElementById("expensePaidBy");
  paidBySelect.innerHTML = group.members
    .map((member) => `<option value="${member.id}">${member.name}</option>`)
    .join("");
  paidBySelect.value = expense.paidBy;
  openModal("addExpenseModal");
  document.querySelector(".modal-title").textContent = "Edit Expense";
  document.getElementById("addExpenseSubmit").textContent = "Save Changes";
}

async function deleteExpense(expenseId) {
  const confirmed = confirm("Delete this expense?");
  if (!confirmed) return;

  try {
    await apiFetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
    await loadAllData();
  } catch (error) {
    showNotification(error.message, true);
  }
}

async function initializeModalOptions() {
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const paidBy = document.getElementById("expensePaidBy");
  if (!paidBy || !group) return;

  paidBy.innerHTML = group.members
    .map((member) => `<option value="${member.id}">${member.name}</option>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("loginForm");
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    await login(email, password);
  });

  const registerForm = document.getElementById("registerForm");
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();
    await registerUser(name, email, password);
  });

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const nextMode = tab.dataset.authTab;
      const isLogin = nextMode === "login";
      document.querySelectorAll(".auth-tab").forEach((item) => {
        item.classList.toggle("active", item === tab);
      });
      document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
      document
        .getElementById("registerForm")
        .classList.toggle("hidden", isLogin);
    });
  });

  document.querySelectorAll("[data-page='analytics']").forEach((link) => {
    link.addEventListener("click", () => setPage("analytics"));
  });

  document
    .getElementById("simulatorAmount")
    ?.addEventListener("input", updateSimulator);
  document
    .getElementById("simulatorCategory")
    ?.addEventListener("change", updateSimulator);

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document
    .getElementById("createGroupBtn")
    .addEventListener("click", () => openModal("createGroupModal"));
  document
    .getElementById("createGroupSubmit")
    .addEventListener("click", createGroup);
  document
    .getElementById("addMemberBtn")
    .addEventListener("click", () => openModal("addMemberModal"));
  document
    .getElementById("addMemberSubmit")
    .addEventListener("click", addMember);
  document
    .getElementById("detailAddMemberBtn")
    .addEventListener("click", () => openModal("addMemberModal"));
  document
    .getElementById("openGroupDetailBtn")
    .addEventListener("click", () => setPage("groupDetail"));
  document
    .getElementById("detailAddExpenseBtn")
    .addEventListener("click", () => {
      resetExpenseModal();
      openModal("addExpenseModal");
    });
  document.getElementById("addExpenseBtn").addEventListener("click", () => {
    resetExpenseModal();
    openModal("addExpenseModal");
  });
  document
    .getElementById("addExpenseSubmit")
    .addEventListener("click", async () => {
      if (state.editingExpenseId) {
        const group = state.groups.find(
          (item) => item.id === state.currentGroupId,
        );
        const payload = {
          description: document
            .getElementById("expenseDescription")
            .value.trim(),
          amount: Number(document.getElementById("expenseAmount").value || 0),
          category: document.getElementById("expenseCategory").value,
          paidBy: document.getElementById("expensePaidBy").value,
          splitType: "EQUAL",
          participants: group.members.map((member) => member.id),
          date:
            document.getElementById("expenseDate").value ||
            new Date().toISOString().slice(0, 10),
        };

        if (!payload.description || payload.amount <= 0) {
          showNotification("Please enter a valid description and amount.");
          return;
        }

        try {
          await apiFetch(`/api/expenses/${state.editingExpenseId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          state.editingExpenseId = null;
          const modalTitle = document.querySelector(".modal-title");
          if (modalTitle) modalTitle.textContent = "Add Expense";
          document.getElementById("addExpenseSubmit").textContent =
            "Add Expense";
          closeModal("addExpenseModal");
          await loadAllData();
          setPage("expenses");
        } catch (error) {
          showNotification(error.message, true);
        }
        return;
      }

      await createExpense();
    });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.close);
    });
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      const nextPage = link.dataset.page;
      setPage(nextPage);
      if (nextPage === "groupDetail" && state.currentGroupId) {
        renderGroupDetail();
      }
    });
  });

  document
    .getElementById("backToGroupsBtn")
    .addEventListener("click", () => setPage("groups"));

  const token = localStorage.getItem("smartsplitToken");
  if (token) {
    try {
      const user = await apiFetch("/api/me");
      showApp(user);
      await loadAllData();
      setPage("dashboard");
    } catch (error) {
      console.warn("Session restore failed", error);
      localStorage.removeItem("smartsplitToken");
    }
  }
});

window.selectGroup = (groupId) => {
  state.currentGroupId = groupId;
  updateSelectedGroupPanel();
  renderGroupsList();
  renderGroupDetail();
  renderExpenseTable();
  renderSettlements();
  renderBudget();
};

window.removeMember = removeMember;
window.deleteExpense = deleteExpense;
window.openEditExpense = openEditExpense;
