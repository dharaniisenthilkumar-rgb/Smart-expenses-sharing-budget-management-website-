const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "store.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function seedUsers() {
  return [
    {
      id: "user-rahul",
      name: "Rahul",
      email: "rahul@example.com",
      passwordHash: hashPassword("password"),
      avatar: "R",
      createdAt: new Date().toISOString(),
    },
  ];
}

function normalizeStore(store) {
  const baseStore = {
    users: seedUsers(),
    sessions: [],
    groups: [],
    expenses: [],
  };

  if (!store || typeof store !== "object") return baseStore;

  const normalized = {
    ...baseStore,
    ...store,
    users: Array.isArray(store.users) ? store.users : baseStore.users,
    sessions: Array.isArray(store.sessions)
      ? store.sessions
      : baseStore.sessions,
    groups: Array.isArray(store.groups) ? store.groups : baseStore.groups,
    expenses: Array.isArray(store.expenses)
      ? store.expenses
      : baseStore.expenses,
  };

  if (!normalized.users.length) {
    normalized.users = seedUsers();
  }

  if (!normalized.groups.length && !normalized.expenses.length) {
    normalized.groups = [
      {
        id: "demo1",
        name: "Goa Trip 2026",
        description: "Summer vacation trip to Goa",
        currency: "INR",
        budget: 50000,
        createdBy: "user-rahul",
        members: [
          { id: "user-rahul", name: "Rahul", role: "ADMIN" },
          { id: "member-1", name: "Priya", role: "MEMBER" },
          { id: "member-2", name: "Arjun", role: "MEMBER" },
          { id: "member-3", name: "Sneha", role: "MEMBER" },
        ],
        createdAt: new Date().toISOString(),
      },
    ];

    normalized.expenses = [
      {
        id: "exp-1",
        groupId: "demo1",
        description: "Hotel Booking",
        amount: 10000,
        category: "Accommodation",
        paidBy: "user-rahul",
        splitType: "EQUAL",
        participants: ["user-rahul", "member-1", "member-2", "member-3"],
        date: "2024-09-20",
        createdAt: "2024-09-20T11:00:00.000Z",
      },
      {
        id: "exp-2",
        groupId: "demo1",
        description: "Food",
        amount: 5000,
        category: "Food",
        paidBy: "member-1",
        splitType: "EQUAL",
        participants: ["user-rahul", "member-1", "member-2", "member-3"],
        date: "2024-09-21",
        createdAt: "2024-09-21T12:00:00.000Z",
      },
      {
        id: "exp-3",
        groupId: "demo1",
        description: "Transportation",
        amount: 3000,
        category: "Transport",
        paidBy: "member-2",
        splitType: "EQUAL",
        participants: ["user-rahul", "member-1", "member-2", "member-3"],
        date: "2024-09-22",
        createdAt: "2024-09-22T15:00:00.000Z",
      },
    ];
  }

  normalized.groups.forEach((group) => {
    const legacyMember = group.members?.find((member) => member.id === "1");
    const matchingUser = legacyMember
      ? normalized.users.find(
          (user) => user.name.toLowerCase() === legacyMember.name.toLowerCase(),
        )
      : null;
    if (!matchingUser) return;

    group.members = group.members.map((member) =>
      member.id === legacyMember.id ? { ...member, id: matchingUser.id } : member,
    );
    if (group.createdBy === legacyMember.id) {
      group.createdBy = matchingUser.id;
    }
    normalized.expenses = normalized.expenses.map((expense) => {
      if (expense.groupId !== group.id) return expense;
      return {
        ...expense,
        paidBy: expense.paidBy === legacyMember.id ? matchingUser.id : expense.paidBy,
        participants: (expense.participants || []).map((memberId) =>
          memberId === legacyMember.id ? matchingUser.id : memberId,
        ),
      };
    });
  });

  return normalized;
}

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    const seed = normalizeStore({
      users: seedUsers(),
      sessions: [],
      groups: [],
      expenses: [],
    });
    fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2));
    return;
  }

  try {
    const existingStore = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const normalized = normalizeStore(existingStore);
    if (JSON.stringify(normalized) !== fs.readFileSync(dataFile, "utf8")) {
      fs.writeFileSync(dataFile, JSON.stringify(normalized, null, 2));
    }
  } catch (error) {
    const seed = normalizeStore({
      users: seedUsers(),
      sessions: [],
      groups: [],
      expenses: [],
    });
    fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2));
  }
}

function readStore() {
  ensureDataFile();
  return normalizeStore(JSON.parse(fs.readFileSync(dataFile, "utf8")));
}

function writeStore(store) {
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function toSafeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    avatar: user.avatar || (user.name ? user.name[0].toUpperCase() : "U"),
  };
}

function getSessionUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const store = readStore();
  const session = store.sessions.find((entry) => entry.token === token);
  if (!session) return null;

  const user = store.users.find((entry) => entry.id === session.userId);
  return user ? toSafeUser(user) : null;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ message: "Authentication required." });
  }

  req.user = user;
  next();
}

function calculateShares(expense) {
  const { amount, splitType, participants, splits = {} } = expense;
  const shares = {};

  participants.forEach((pid) => {
    shares[pid] = 0;
  });

  if (splitType === "EQUAL") {
    const shareAmount = Math.floor(amount / participants.length);
    const remainder = amount - shareAmount * participants.length;

    participants.forEach((pid, idx) => {
      shares[pid] = shareAmount + (idx === 0 ? remainder : 0);
    });
  } else if (splitType === "CUSTOM") {
    participants.forEach((pid) => {
      shares[pid] = Number(splits[pid] || 0);
    });
  } else if (splitType === "PERCENTAGE") {
    participants.forEach((pid) => {
      shares[pid] = Math.round((amount * (Number(splits[pid]) || 0)) / 100);
    });
  } else if (splitType === "SHARES") {
    const totalShares = participants.reduce(
      (sum, pid) => sum + (Number(splits[pid]) || 1),
      0,
    );
    const valuePerShare = Math.round(amount / totalShares);

    participants.forEach((pid) => {
      shares[pid] = valuePerShare * (Number(splits[pid]) || 1);
    });
  }

  return shares;
}

function calculateGroupBalances(groupExpenses, groupMembers) {
  const balances = {};

  groupMembers.forEach((member) => {
    balances[member.id] = {
      memberId: member.id,
      name: member.name,
      totalPaid: 0,
      totalShare: 0,
    };
  });

  groupExpenses.forEach((expense) => {
    const shares = calculateShares(expense);

    if (balances[expense.paidBy]) {
      balances[expense.paidBy].totalPaid += Number(expense.amount || 0);
    }

    Object.entries(shares).forEach(([userId, share]) => {
      if (balances[userId]) {
        balances[userId].totalShare += Number(share || 0);
      }
    });
  });

  Object.values(balances).forEach((balance) => {
    balance.netBalance = balance.totalPaid - balance.totalShare;
  });

  return Object.values(balances);
}

function generateSettlementPlan(balances) {
  const creditors = [];
  const debtors = [];

  balances.forEach((balance) => {
    if (balance.netBalance > 0) {
      creditors.push({ ...balance, remaining: balance.netBalance });
    } else if (balance.netBalance < 0) {
      debtors.push({ ...balance, remaining: Math.abs(balance.netBalance) });
    }
  });

  creditors.sort((a, b) => b.remaining - a.remaining);
  debtors.sort((a, b) => b.remaining - a.remaining);

  const settlements = [];
  let creditorIdx = 0;
  let debtorIdx = 0;

  while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
    const creditor = creditors[creditorIdx];
    const debtor = debtors[debtorIdx];
    const amount = Math.min(creditor.remaining, debtor.remaining);

    if (amount <= 0) {
      debtorIdx += 1;
      creditorIdx += 1;
      continue;
    }

    settlements.push({
      from: debtor.memberId,
      fromName: debtor.name,
      to: creditor.memberId,
      toName: creditor.name,
      amount: Math.round(amount),
      status: "PENDING",
    });

    creditor.remaining -= amount;
    debtor.remaining -= amount;

    if (creditor.remaining <= 0.01) creditorIdx += 1;
    if (debtor.remaining <= 0.01) debtorIdx += 1;
  }

  return settlements;
}

function buildSettlements(groupId) {
  const store = readStore();
  const group = store.groups.find((item) => item.id === groupId);
  if (!group) return [];

  const expenses = store.expenses.filter(
    (expense) => expense.groupId === groupId,
  );
  const balances = calculateGroupBalances(expenses, group.members);
  return generateSettlementPlan(balances);
}

function getGroupForUser(store, groupId, userId) {
  const group = store.groups.find((item) => item.id === groupId);
  if (!group) return { error: "Group not found", status: 404 };

  const isMember =
    group.createdBy === userId ||
    group.members.some((member) => member.id === userId);
  if (!isMember) {
    return { error: "You are not a member of this group.", status: 403 };
  }

  return { group };
}

function getBudgetStatus(totalSpent, budget) {
  const totalBudget = Number(budget || 0);
  const usagePercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  if (totalBudget === 0 && totalSpent > 0) {
    return {
      label: "Exceeded",
      message: "Your group has exceeded the budget.",
      tone: "danger",
    };
  }
  if (usagePercentage > 100) {
    return {
      label: "Exceeded",
      message: "Your group has exceeded the budget.",
      tone: "danger",
    };
  }
  if (usagePercentage >= 90) {
    return {
      label: "Critical",
      message: "Your group is close to reaching the budget limit.",
      tone: "danger",
    };
  }
  if (usagePercentage >= 70) {
    return {
      label: "Warning",
      message: "You have used most of your group budget.",
      tone: "warning",
    };
  }
  return { label: "On track", message: "Your group is on track.", tone: "success" };
}

function buildGroupIntelligence(store, group) {
  const expenses = store.expenses.filter((expense) => expense.groupId === group.id);
  const totalSpent = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const totalBudget = Number(group.budget || 0);
  const categories = {};

  expenses.forEach((expense) => {
    const category = String(expense.category || "Other").trim() || "Other";
    categories[category] = (categories[category] || 0) + Number(expense.amount || 0);
  });

  const categoryBreakdown = Object.entries(categories)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const highestCategory = categoryBreakdown[0] || null;
  const lowestCategory = categoryBreakdown.length
    ? categoryBreakdown[categoryBreakdown.length - 1]
    : null;
  const status = getBudgetStatus(totalSpent, totalBudget);

  const unusualExpenses = expenses
    .map((expense, index) => {
      const categoryExpenses = expenses.filter(
        (candidate, candidateIndex) =>
          candidate.category === expense.category && candidateIndex !== index,
      );
      if (categoryExpenses.length < 2) return null;
      const historicalAverage =
        categoryExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0) /
        categoryExpenses.length;
      if (historicalAverage <= 0 || Number(expense.amount || 0) < historicalAverage * 2.5) {
        return null;
      }
      return {
        expenseId: expense.id,
        description: expense.description,
        category: expense.category || "Other",
        amount: Number(expense.amount || 0),
        historicalAverage,
        message:
          "This expense is significantly higher than the previous average for this category.",
      };
    })
    .filter(Boolean);

  const balances = calculateGroupBalances(expenses, group.members);
  return {
    totalBudget,
    totalSpent,
    remainingBudget: totalBudget - totalSpent,
    usagePercentage: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
    budgetStatus: status,
    categoryBreakdown,
    highestCategory,
    lowestCategory,
    spendingInsight: highestCategory
      ? `${highestCategory.category} is currently the highest spending category and represents ${highestCategory.percentage.toFixed(1)}% of total group spending.`
      : "Add expenses to unlock category spending insights.",
    unusualExpenses,
    balances,
    settlements: generateSettlementPlan(balances),
  };
}

function validateExpensePayload(payload, group, fallback = {}) {
  const amount = Number(payload.amount ?? fallback.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Expense amount must be greater than 0.";
  }

  const paidBy = payload.paidBy || fallback.paidBy;
  if (!group.members.some((member) => member.id === paidBy)) {
    return "Expense payer must be a member of the selected group.";
  }

  const participants = payload.participants || fallback.participants;
  if (!Array.isArray(participants) || participants.length === 0) {
    return "Select at least one split member.";
  }
  if (new Set(participants).size !== participants.length) {
    return "Split members cannot be duplicated.";
  }
  if (participants.some((memberId) => !group.members.some((member) => member.id === memberId))) {
    return "All split members must belong to the selected group.";
  }

  const splitType = payload.splitType || fallback.splitType || "EQUAL";
  if (!["EQUAL", "CUSTOM", "PERCENTAGE", "SHARES"].includes(splitType)) {
    return "Unsupported split type.";
  }

  const shares = calculateShares({
    amount,
    splitType,
    participants,
    splits: payload.splits || fallback.splits || {},
  });
  const totalShares = Object.values(shares).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  if (splitType !== "EQUAL" && Math.abs(totalShares - amount) > 1) {
    return "Split amounts must add up to the expense amount.";
  }
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "SmartSplit backend is running" });
});

app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Full name is required." });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({ message: "Email is required." });
  }

  if (!password || password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters." });
  }

  const store = readStore();
  const exists = store.users.some(
    (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (exists) {
    return res
      .status(409)
      .json({ message: "An account with this email already exists." });
  }

  const newUser = {
    id: makeId("user"),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    avatar: name.trim()[0]?.toUpperCase() || "U",
    createdAt: new Date().toISOString(),
  };

  store.users.push(newUser);
  writeStore(store);

  const token = crypto.randomBytes(24).toString("hex");
  store.sessions.push({
    token,
    userId: newUser.id,
    createdAt: new Date().toISOString(),
  });
  writeStore(store);

  res.status(201).json({ token, user: toSafeUser(newUser) });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  const store = readStore();
  const user = store.users.find(
    (entry) => entry.email.toLowerCase() === String(email).trim().toLowerCase(),
  );

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = crypto.randomBytes(24).toString("hex");
  store.sessions = store.sessions.filter(
    (session) => session.userId !== user.id,
  );
  store.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });
  writeStore(store);

  res.json({ token, user: toSafeUser(user) });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    const store = readStore();
    store.sessions = store.sessions.filter(
      (session) => session.token !== token,
    );
    writeStore(store);
  }

  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.user);
});

app.get("/api/groups", requireAuth, (req, res) => {
  const store = readStore();
  res.json(
    store.groups.filter(
      (group) =>
        group.createdBy === req.user.id ||
        group.members.some((member) => member.id === req.user.id),
    ),
  );
});

app.post("/api/groups", requireAuth, (req, res) => {
  const { name, description, currency, budget } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Group name is required." });
  }

  const numericBudget = Number(budget ?? 0);
  if (!Number.isFinite(numericBudget) || numericBudget < 0) {
    return res.status(400).json({ message: "Budget must be a valid number of 0 or more." });
  }

  const store = readStore();
  const newGroup = {
    id: makeId("group"),
    name: name.trim(),
    description: description || "",
    currency: currency || "INR",
    budget: numericBudget,
    createdBy: req.user.id,
    members: [{ id: req.user.id, name: req.user.name, role: "ADMIN" }],
    createdAt: new Date().toISOString(),
  };

  store.groups.push(newGroup);
  writeStore(store);
  res.status(201).json(newGroup);
});

app.get("/api/groups/:groupId", requireAuth, (req, res) => {
  const store = readStore();
  const group = store.groups.find((item) => item.id === req.params.groupId);
  if (!group) return res.status(404).json({ message: "Group not found" });

  const isMember =
    group.members.some((member) => member.id === req.user.id) ||
    group.createdBy === req.user.id;
  if (!isMember)
    return res
      .status(403)
      .json({ message: "You are not a member of this group." });

  res.json(group);
});

app.post("/api/groups/:groupId/members", requireAuth, (req, res) => {
  const { name, role = "MEMBER" } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Member name is required." });
  }

  const store = readStore();
  const group = store.groups.find((item) => item.id === req.params.groupId);
  if (!group) return res.status(404).json({ message: "Group not found" });

  const isMember =
    group.members.some((member) => member.id === req.user.id) ||
    group.createdBy === req.user.id;
  if (!isMember)
    return res
      .status(403)
      .json({ message: "You are not allowed to manage this group." });

  const exists = group.members.some(
    (member) => member.name.toLowerCase() === name.trim().toLowerCase(),
  );

  if (exists) {
    return res
      .status(400)
      .json({ message: "This member already exists in the group." });
  }

  const newMember = {
    id: makeId("member"),
    name: name.trim(),
    role,
  };

  group.members.push(newMember);
  writeStore(store);
  res.status(201).json(newMember);
});

app.delete(
  "/api/groups/:groupId/members/:memberId",
  requireAuth,
  (req, res) => {
    const store = readStore();
    const group = store.groups.find((item) => item.id === req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember =
      group.members.some((member) => member.id === req.user.id) ||
      group.createdBy === req.user.id;
    if (!isMember)
      return res
        .status(403)
        .json({ message: "You are not allowed to manage this group." });

    const member = group.members.find(
      (item) => item.id === req.params.memberId,
    );
    if (!member) return res.status(404).json({ message: "Member not found" });

    if (member.id === group.createdBy) {
      return res
        .status(400)
        .json({ message: "The group creator cannot be removed." });
    }

    group.members = group.members.filter(
      (item) => item.id !== req.params.memberId,
    );

    store.expenses = store.expenses.map((expense) => {
      if (expense.groupId !== group.id) return expense;

      let participants = (expense.participants || []).filter(
        (pid) => pid !== req.params.memberId,
      );
      if (participants.length === 0) {
        participants = group.members.map((item) => item.id);
      }

      let paidBy = expense.paidBy;
      if (expense.paidBy === req.params.memberId) {
        paidBy = participants[0] || group.members[0]?.id || req.user.id;
      }

      return { ...expense, paidBy, participants };
    });

    writeStore(store);
    res.json({ ok: true });
  },
);

app.get("/api/expenses", requireAuth, (req, res) => {
  const store = readStore();
  const { groupId } = req.query;

  const expenses = groupId
    ? store.expenses.filter((expense) => expense.groupId === groupId)
    : store.expenses;

  res.json(
    expenses.filter((expense) => {
      const group = store.groups.find((entry) => entry.id === expense.groupId);
      return Boolean(
        group && group.members.some((member) => member.id === req.user.id),
      );
    }),
  );
});

app.post("/api/expenses", requireAuth, (req, res) => {
  const store = readStore();
  const payload = req.body || {};

  if (!payload.description || !payload.groupId) {
    return res
      .status(400)
      .json({ message: "Description and groupId are required." });
  }

  const group = store.groups.find((item) => item.id === payload.groupId);
  if (!group) return res.status(404).json({ message: "Group not found" });

  const isMember =
    group.members.some((member) => member.id === req.user.id) ||
    group.createdBy === req.user.id;
  if (!isMember)
    return res
      .status(403)
      .json({ message: "You cannot add expenses to this group." });

  const validationError = validateExpensePayload(payload, group);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const expense = {
    id: payload.id || makeId("exp"),
    groupId: payload.groupId,
    description: payload.description,
    amount: Number(payload.amount),
    category: payload.category || "Other",
    paidBy: payload.paidBy || req.user.id,
    splitType: payload.splitType || "EQUAL",
    participants:
      payload.participants || group.members.map((member) => member.id),
    date: payload.date || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    splits: payload.splits || {},
  };

  const existingIndex = store.expenses.findIndex(
    (item) => item.id === expense.id,
  );
  if (existingIndex >= 0) {
    store.expenses[existingIndex] = expense;
  } else {
    store.expenses.push(expense);
  }

  writeStore(store);
  res.status(existingIndex >= 0 ? 200 : 201).json(expense);
});

app.put("/api/expenses/:expenseId", requireAuth, (req, res) => {
  const store = readStore();
  const index = store.expenses.findIndex(
    (item) => item.id === req.params.expenseId,
  );
  if (index === -1)
    return res.status(404).json({ message: "Expense not found" });

  const expense = store.expenses[index];
  const group = store.groups.find((item) => item.id === expense.groupId);
  const isMember =
    group &&
    (group.members.some((member) => member.id === req.user.id) ||
      group.createdBy === req.user.id);
  if (!isMember)
    return res
      .status(403)
      .json({ message: "You are not allowed to update this expense." });

  const validationError = validateExpensePayload(req.body || {}, group, expense);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const updatedExpense = {
    ...expense,
    description: req.body.description ?? expense.description,
    amount: Number(req.body.amount ?? expense.amount),
    category: req.body.category || expense.category || "Other",
    paidBy: req.body.paidBy || expense.paidBy,
    splitType: req.body.splitType || expense.splitType || "EQUAL",
    participants: req.body.participants || expense.participants,
    splits: req.body.splits || expense.splits || {},
    id: req.params.expenseId,
    date: req.body.date || expense.date,
  };

  store.expenses[index] = updatedExpense;
  writeStore(store);
  res.json(updatedExpense);
});

app.delete("/api/expenses/:expenseId", requireAuth, (req, res) => {
  const store = readStore();
  const expense = store.expenses.find(
    (item) => item.id === req.params.expenseId,
  );
  if (!expense) return res.status(404).json({ message: "Expense not found" });

  const group = store.groups.find((item) => item.id === expense.groupId);
  const isMember =
    group &&
    (group.members.some((member) => member.id === req.user.id) ||
      group.createdBy === req.user.id);
  if (!isMember)
    return res
      .status(403)
      .json({ message: "You are not allowed to delete this expense." });

  store.expenses = store.expenses.filter(
    (item) => item.id !== req.params.expenseId,
  );
  writeStore(store);
  res.json({ ok: true });
});

app.get("/api/groups/:groupId/settlements", requireAuth, (req, res) => {
  const store = readStore();
  const access = getGroupForUser(store, req.params.groupId, req.user.id);
  if (access.error) return res.status(access.status).json({ message: access.error });
  res.json(buildSettlements(req.params.groupId));
});

app.get("/api/groups/:groupId/intelligence", requireAuth, (req, res) => {
  const store = readStore();
  const access = getGroupForUser(store, req.params.groupId, req.user.id);
  if (access.error) return res.status(access.status).json({ message: access.error });
  res.json(buildGroupIntelligence(store, access.group));
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  const store = readStore();
  const groups = store.groups.filter(
    (group) =>
      group.createdBy === req.user.id ||
      group.members.some((member) => member.id === req.user.id),
  );
  const groupIds = new Set(groups.map((group) => group.id));
  const expenses = store.expenses.filter((expense) => groupIds.has(expense.groupId));
  const totalSpent = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const pendingSettlements = groups.flatMap((group) =>
    buildSettlements(group.id),
  );

  res.json({
    totalGroups: groups.length,
    totalSpending: totalSpent,
    pendingSettlements: pendingSettlements.length,
    settledSettlements: 0,
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SmartSplit API running on http://localhost:${PORT}`);
});
