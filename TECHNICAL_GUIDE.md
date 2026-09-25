# SmartSplit - Technical Implementation Guide

## 📚 Table of Contents
1. [Core Algorithms](#core-algorithms)
2. [API Structure](#api-structure)
3. [Database Schema](#database-schema)
4. [Implementation Examples](#implementation-examples)
5. [Best Practices](#best-practices)
6. [Common Pitfalls](#common-pitfalls)

---

## 🧮 Core Algorithms

### Algorithm 1: Expense Share Calculation

**Purpose:** Calculate how much each participant owes for a given expense

**Input:**
- Expense amount (integer, in paise/cents)
- Split method (EQUAL, CUSTOM, PERCENTAGE, SHARES)
- List of participant IDs
- Split parameters (optional, based on method)

**Output:**
- Map of {participantId: shareAmount}

#### Implementation

```javascript
class ExpenseService {
  static calculateShares(expense) {
    const { amount, splitType, participants, splits } = expense;
    const shares = {};
    
    // Initialize all participants
    participants.forEach(pid => {
      shares[pid] = 0;
    });

    switch(splitType) {
      case 'EQUAL': {
        const shareAmount = Math.floor(amount / participants.length);
        const remainder = amount - (shareAmount * participants.length);
        
        participants.forEach((pid, idx) => {
          shares[pid] = shareAmount + (idx === 0 ? remainder : 0);
        });
        break;
      }

      case 'CUSTOM': {
        // User has already specified exact amounts
        participants.forEach(pid => {
          shares[pid] = splits[pid] || 0;
        });
        // VALIDATE: sum must equal amount
        const total = Object.values(shares).reduce((a, b) => a + b, 0);
        if (total !== amount) {
          throw new Error('Custom split amounts must equal expense total');
        }
        break;
      }

      case 'PERCENTAGE': {
        // Splits contain percentages
        participants.forEach(pid => {
          shares[pid] = Math.round((amount * (splits[pid] || 0)) / 100);
        });
        // Ensure total equals amount by adjusting first participant
        const total = Object.values(shares).reduce((a, b) => a + b, 0);
        if (total !== amount) {
          const diff = amount - total;
          shares[participants[0]] += diff;
        }
        break;
      }

      case 'SHARES': {
        // Splits contain share counts (e.g., {userId1: 2, userId2: 1})
        const totalShares = participants.reduce(
          (sum, pid) => sum + (splits[pid] || 1), 0
        );
        const valuePerShare = Math.round(amount / totalShares);
        
        participants.forEach(pid => {
          shares[pid] = valuePerShare * (splits[pid] || 1);
        });
        
        // Adjust for rounding errors
        const total = Object.values(shares).reduce((a, b) => a + b, 0);
        if (total !== amount) {
          const diff = amount - total;
          shares[participants[0]] += diff;
        }
        break;
      }

      default:
        throw new Error('Invalid split type');
    }

    // Final validation
    const finalTotal = Object.values(shares).reduce((a, b) => a + b, 0);
    if (finalTotal !== amount) {
      throw new Error('Share calculation error - total does not equal expense');
    }

    return shares;
  }
}
```

**Key Points:**
- Always work with integers (paise, not rupees)
- Handle rounding by adjusting first participant
- Validate that shares sum exactly to expense amount
- Throw errors for invalid splits

---

### Algorithm 2: Balance Calculation

**Purpose:** Calculate net balance for each group member

**Formula:**
```
netBalance = totalAmountPaid - totalAmountOwed
```

**Algorithm:**

```javascript
class BalanceService {
  static calculateGroupBalances(expenses, groupMembers) {
    // Step 1: Initialize balance object
    const balances = {};
    groupMembers.forEach(member => {
      balances[member.id] = {
        memberId: member.id,
        name: member.name,
        totalPaid: 0,      // Money they paid
        totalShare: 0,     // Money they owe
        netBalance: 0      // Calculated at end
      };
    });

    // Step 2: Process each expense
    expenses.forEach(expense => {
      // Calculate shares for this expense
      const shares = ExpenseService.calculateShares(expense);
      
      // Add to paidBy person's total paid
      if (balances[expense.paidBy]) {
        balances[expense.paidBy].totalPaid += expense.amount;
      }
      
      // Add to each participant's total share
      Object.entries(shares).forEach(([userId, shareAmount]) => {
        if (balances[userId]) {
          balances[userId].totalShare += shareAmount;
        }
      });
    });

    // Step 3: Calculate net balance for each member
    Object.values(balances).forEach(balance => {
      balance.netBalance = balance.totalPaid - balance.totalShare;
    });

    return Object.values(balances);
  }

  static interpretBalance(balance) {
    if (balance.netBalance > 0) {
      return {
        status: 'CREDITOR',
        message: `${balance.name} should receive ₹${balance.netBalance}`,
        amount: balance.netBalance
      };
    } else if (balance.netBalance < 0) {
      return {
        status: 'DEBTOR',
        message: `${balance.name} owes ₹${Math.abs(balance.netBalance)}`,
        amount: Math.abs(balance.netBalance)
      };
    } else {
      return {
        status: 'SETTLED',
        message: `${balance.name} is settled`,
        amount: 0
      };
    }
  }
}
```

**Example Walkthrough:**

```
Expense 1: Hotel ₹10,000 (Rahul paid, 4 people)
  Shares: Rahul: 2500, Priya: 2500, Arjun: 2500, Sneha: 2500

After Expense 1:
  Rahul:  paid=10000, share=2500, balance=+7500
  Priya:  paid=0,     share=2500, balance=-2500
  Arjun:  paid=0,     share=2500, balance=-2500
  Sneha:  paid=0,     share=2500, balance=-2500

Expense 2: Food ₹4,000 (Priya paid, 4 people)
  Shares: Rahul: 1000, Priya: 1000, Arjun: 1000, Sneha: 1000

After Expense 2:
  Rahul:  paid=10000, share=3500, balance=+6500
  Priya:  paid=4000,  share=3500, balance=+500
  Arjun:  paid=0,     share=3500, balance=-3500
  Sneha:  paid=0,     share=3500, balance=-3500

Interpretation:
  Rahul: CREDITOR (receives 6500)
  Priya: CREDITOR (receives 500)
  Arjun: DEBTOR (owes 3500)
  Sneha: DEBTOR (owes 3500)
```

---

### Algorithm 3: Settlement Optimization

**Purpose:** Generate minimum set of transactions to settle all debts

**Strategy:** Greedy matching algorithm

**Algorithm:**

```javascript
class SettlementService {
  static generateSettlementPlan(balances) {
    // Step 1: Separate creditors and debtors
    const creditors = [];
    const debtors = [];
    
    balances.forEach(balance => {
      if (balance.netBalance > 0) {
        creditors.push({
          ...balance,
          remaining: balance.netBalance
        });
      } else if (balance.netBalance < 0) {
        debtors.push({
          ...balance,
          remaining: Math.abs(balance.netBalance)
        });
      }
      // netBalance === 0: Skip, already settled
    });

    const settlements = [];
    let creditorIdx = 0;
    let debtorIdx = 0;

    // Step 2: Match debtors with creditors
    while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
      const creditor = creditors[creditorIdx];
      const debtor = debtors[debtorIdx];
      
      // Amount to transfer
      const amount = Math.min(creditor.remaining, debtor.remaining);
      
      // Create settlement transaction
      if (amount > 0) {
        settlements.push({
          from: debtor.memberId,
          fromName: debtor.name,
          to: creditor.memberId,
          toName: creditor.name,
          amount: amount,
          status: 'PENDING'
        });
      }
      
      // Update remaining balances
      creditor.remaining -= amount;
      debtor.remaining -= amount;
      
      // Move to next person if done
      if (creditor.remaining === 0) creditorIdx++;
      if (debtor.remaining === 0) debtorIdx++;
    }

    return settlements;
  }

  static validateSettlements(settlements, originalBalances) {
    // Verify total amount in = total amount out
    const totalIn = settlements.reduce((sum, s) => sum + s.amount, 0);
    const totalOut = settlements.reduce((sum, s) => sum + s.amount, 0);
    
    if (totalIn !== totalOut) {
      throw new Error('Settlement amount mismatch');
    }

    // Verify no self-transactions
    const selfTransactions = settlements.filter(s => s.from === s.to);
    if (selfTransactions.length > 0) {
      throw new Error('Self-transactions detected');
    }

    return true;
  }
}
```

**Example:**

```
Input Balances:
  Rahul:   +₹7,000 (creditor)
  Priya:   +₹2,000 (creditor)
  Arjun:   -₹2,000 (debtor)
  Sneha:   -₹3,000 (debtor)
  Aman:    -₹4,000 (debtor)

Matching Process:
1. Match Arjun (-2000) with Rahul (+7000)
   → Arjun → Rahul: ₹2000
   → Rahul: 7000 - 2000 = +5000
   → Arjun: done

2. Match Sneha (-3000) with Rahul (+5000)
   → Sneha → Rahul: ₹3000
   → Rahul: 5000 - 3000 = +2000
   → Sneha: done

3. Match Aman (-4000) with Rahul (+2000)
   → Aman → Rahul: ₹2000
   → Rahul: done
   → Aman: 4000 - 2000 = -2000

4. Match Aman (-2000) with Priya (+2000)
   → Aman → Priya: ₹2000
   → Both done

Final Settlement Plan:
  Arjun → Rahul: ₹2,000
  Sneha → Rahul: ₹3,000
  Aman → Rahul: ₹2,000
  Aman → Priya: ₹2,000

Total Transactions: 4 (minimal)
```

---

### Algorithm 4: Analytics Calculation

```javascript
class AnalyticsService {
  static calculateGroupAnalytics(expenses, budget = 0) {
    // Basic metrics
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    // Count
    const expenseCount = expenses.length;
    const averageExpense = expenseCount > 0 
      ? Math.round(totalSpent / expenseCount) 
      : 0;
    const largestExpense = Math.max(
      ...expenses.map(e => e.amount), 
      0
    );

    // Category breakdown
    const categorySpending = {};
    expenses.forEach(expense => {
      categorySpending[expense.category] = 
        (categorySpending[expense.category] || 0) + expense.amount;
    });

    // Member contribution
    const memberSpending = {};
    expenses.forEach(expense => {
      memberSpending[expense.paidBy] = 
        (memberSpending[expense.paidBy] || 0) + expense.amount;
    });

    // Budget analysis
    const budgetUsagePercent = budget > 0 
      ? Math.round((totalSpent / budget) * 100) 
      : 0;
    const remainingBudget = Math.max(0, budget - totalSpent);

    return {
      totalSpent,
      expenseCount,
      averageExpense,
      largestExpense,
      categorySpending,
      memberSpending,
      budgetUsagePercent,
      remainingBudget,
      budgetStatus: this.getBudgetStatus(budgetUsagePercent)
    };
  }

  static getBudgetStatus(usagePercent) {
    if (usagePercent < 70) return 'NORMAL';
    if (usagePercent < 90) return 'WARNING';
    if (usagePercent < 100) return 'CRITICAL';
    return 'EXCEEDED';
  }

  static generateInsights(analytics, expenses, settlements) {
    const insights = [];

    // Category insight
    if (analytics.totalSpent > 0) {
      const [topCategory, topAmount] = Object.entries(
        analytics.categorySpending
      ).sort((a, b) => b[1] - a[1])[0] || ['', 0];
      
      if (topAmount > analytics.totalSpent * 0.35) {
        const percent = Math.round((topAmount / analytics.totalSpent) * 100);
        insights.push(
          `💡 ${topCategory} is your largest spending category at ${percent}%`
        );
      }
    }

    // Budget insight
    if (analytics.budgetUsagePercent >= 90 && analytics.budgetUsagePercent < 100) {
      insights.push(`⚠️ You're close to budget limit (${analytics.budgetUsagePercent}% used)`);
    } else if (analytics.budgetUsagePercent >= 100) {
      const overspend = analytics.totalSpent - analytics.remainingBudget;
      insights.push(`🔴 Budget exceeded by ₹${overspend}`);
    }

    // Settlement insight
    const pendingCount = settlements.filter(s => s.status === 'PENDING').length;
    if (pendingCount > 0) {
      insights.push(`📊 ${pendingCount} settlement(s) pending`);
    }

    return insights;
  }
}
```

---

## 🔌 API Structure

### Authentication Endpoints

```
POST /api/auth/register
  {
    "name": "Rahul",
    "email": "rahul@example.com",
    "password": "secure_password"
  }
  
  Response: {
    "success": true,
    "user": { id, name, email, token }
  }

POST /api/auth/login
  {
    "email": "rahul@example.com",
    "password": "secure_password"
  }
  
  Response: {
    "success": true,
    "token": "jwt_token",
    "user": { id, name, email }
  }

GET /api/auth/me
  Headers: { Authorization: "Bearer token" }
  
  Response: {
    "success": true,
    "user": { id, name, email, avatar }
  }

POST /api/auth/logout
  Response: { "success": true }
```

### Group Endpoints

```
POST /api/groups
  {
    "name": "Goa Trip",
    "description": "Summer vacation",
    "currency": "INR",
    "budget": 50000
  }
  
  Response: { "success": true, "group": {...} }

GET /api/groups
  Response: {
    "success": true,
    "groups": [{ id, name, description, budget, members, ... }]
  }

GET /api/groups/:groupId
  Response: { "success": true, "group": {...} }

PATCH /api/groups/:groupId
  { "name": "New Name", "budget": 60000 }
  Response: { "success": true, "group": {...} }

DELETE /api/groups/:groupId
  Response: { "success": true, "message": "Group deleted" }

POST /api/groups/:groupId/members
  { "userId": "user_id", "role": "MEMBER" }
  Response: { "success": true, "member": {...} }

DELETE /api/groups/:groupId/members/:userId
  Response: { "success": true, "message": "Member removed" }
```

### Expense Endpoints

```
POST /api/groups/:groupId/expenses
  {
    "description": "Hotel",
    "amount": 10000,
    "category": "Accommodation",
    "paidBy": "user_id",
    "splitType": "EQUAL",
    "participants": ["user1", "user2", "user3"],
    "date": "2024-09-20"
  }
  
  Response: {
    "success": true,
    "expense": {
      id, groupId, description, amount, category, paidBy,
      splitType, participants, shares: {}, date
    }
  }

GET /api/groups/:groupId/expenses
  Response: {
    "success": true,
    "expenses": [...]
  }

GET /api/expenses/:expenseId
  Response: { "success": true, "expense": {...} }

PATCH /api/expenses/:expenseId
  { "description": "Hotel Booking", "amount": 11000 }
  Response: { "success": true, "expense": {...} }

DELETE /api/expenses/:expenseId
  Response: { "success": true, "message": "Expense deleted" }
```

### Balance & Settlement Endpoints

```
GET /api/groups/:groupId/balances
  Response: {
    "success": true,
    "balances": [
      {
        "memberId": "user_id",
        "name": "Rahul",
        "totalPaid": 10000,
        "totalShare": 2500,
        "netBalance": 7500
      }
    ]
  }

GET /api/groups/:groupId/settlements
  Response: {
    "success": true,
    "settlements": [
      {
        "from": "user1_id",
        "fromName": "Arjun",
        "to": "user2_id",
        "toName": "Rahul",
        "amount": 2500,
        "status": "PENDING"
      }
    ]
  }

POST /api/groups/:groupId/settlements/:settlementId/pay
  { "status": "COMPLETED" }
  Response: { "success": true, "settlement": {...} }
```

### Budget Endpoints

```
GET /api/groups/:groupId/budget
  Response: {
    "success": true,
    "budget": {
      "groupId": "group_id",
      "totalBudget": 50000,
      "spent": 32500,
      "remaining": 17500,
      "usagePercent": 65,
      "categories": {
        "Food": { budget: 10000, spent: 8500 },
        "Accommodation": { budget: 20000, spent: 20000 }
      }
    }
  }

PATCH /api/groups/:groupId/budget
  { "totalBudget": 60000 }
  Response: { "success": true, "budget": {...} }
```

### Analytics Endpoints

```
GET /api/groups/:groupId/analytics
  Response: {
    "success": true,
    "analytics": {
      "totalSpent": 32500,
      "expenseCount": 10,
      "averageExpense": 3250,
      "largestExpense": 10000,
      "budgetUsagePercent": 65,
      "categorySpending": {
        "Food": 8500,
        "Accommodation": 20000
      },
      "memberSpending": {
        "user1_id": 12000,
        "user2_id": 8500
      }
    },
    "insights": [
      "💡 Accommodation is your largest spending category",
      "📊 2 settlements pending"
    ]
  }
```

---

## 💾 Database Schema

### PostgreSQL with Prisma

```prisma
// User Model
model User {
  id        String    @id @default(cuid())
  name      String
  email     String    @unique
  passwordHash String
  avatar    String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  groups    Group[]
  members   GroupMember[]
  expenses  Expense[]
  settlements Settlement[]
}

// Group Model
model Group {
  id          String    @id @default(cuid())
  name        String
  description String?
  currency    String    @default("INR")
  budget      Int       @default(0)
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  members     GroupMember[]
  expenses    Expense[]
  settlements Settlement[]
  budgets     Budget[]
}

// GroupMember Model
model GroupMember {
  id        String    @id @default(cuid())
  groupId   String
  userId    String
  role      String    @default("MEMBER") // ADMIN or MEMBER
  joinedAt  DateTime  @default(now())
  
  group     Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([groupId, userId])
}

// Expense Model
model Expense {
  id          String    @id @default(cuid())
  groupId     String
  description String
  amount      Int       // In paise/cents
  category    String
  paidBy      String
  splitType   String    // EQUAL, CUSTOM, PERCENTAGE, SHARES
  expenseDate DateTime
  receiptUrl  String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  group       Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  shares      ExpenseShare[]
}

// ExpenseShare Model
model ExpenseShare {
  id          String    @id @default(cuid())
  expenseId   String
  userId      String
  amount      Int       // Share in paise/cents
  percentage  Float?
  shares      Int?
  
  expense     Expense   @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  
  @@unique([expenseId, userId])
}

// Settlement Model
model Settlement {
  id          String    @id @default(cuid())
  groupId     String
  payerId     String    // Who pays
  receiverId  String    // Who receives
  amount      Int       // In paise/cents
  status      String    @default("PENDING") // PENDING or COMPLETED
  createdAt   DateTime  @default(now())
  settledAt   DateTime?
  
  group       Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
}

// Budget Model (optional - for category budgets)
model Budget {
  id        String    @id @default(cuid())
  groupId   String
  category  String
  amount    Int       // In paise/cents
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  group     Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
}

// Notification Model
model Notification {
  id        String    @id @default(cuid())
  userId    String
  type      String
  message   String
  isRead    Boolean   @default(false)
  createdAt DateTime  @default(now())
  
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 🛠️ Implementation Examples

### Backend (Node.js/Express)

```javascript
// services/settlementService.ts
class SettlementService {
  async generateSettlements(groupId: string) {
    // Get group with all members
    const group = await db.group.findUnique({
      where: { id: groupId },
      include: { members: true }
    });

    // Get all expenses for group
    const expenses = await db.expense.findMany({
      where: { groupId },
      include: { shares: true }
    });

    // Calculate balances
    const balances = this.calculateBalances(expenses, group.members);

    // Generate settlement plan
    const settlements = this.optimizeSettlements(balances);

    // Save settlements
    for (const settlement of settlements) {
      await db.settlement.create({
        data: {
          groupId,
          payerId: settlement.from,
          receiverId: settlement.to,
          amount: settlement.amount,
          status: 'PENDING'
        }
      });
    }

    return settlements;
  }

  calculateBalances(expenses: any[], members: any[]) {
    const balances = {};
    
    members.forEach(member => {
      balances[member.id] = {
        memberId: member.id,
        name: member.name,
        totalPaid: 0,
        totalShare: 0
      };
    });

    expenses.forEach(expense => {
      if (balances[expense.paidBy]) {
        balances[expense.paidBy].totalPaid += expense.amount;
      }

      expense.shares.forEach(share => {
        if (balances[share.userId]) {
          balances[share.userId].totalShare += share.amount;
        }
      });
    });

    Object.values(balances).forEach(balance => {
      balance.netBalance = balance.totalPaid - balance.totalShare;
    });

    return Object.values(balances);
  }

  optimizeSettlements(balances: any[]) {
    const creditors = balances.filter(b => b.netBalance > 0);
    const debtors = balances.filter(b => b.netBalance < 0);

    const settlements = [];
    let creditorIdx = 0;
    let debtorIdx = 0;

    while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
      const creditor = creditors[creditorIdx];
      const debtor = debtors[debtorIdx];
      
      const amount = Math.min(
        creditor.netBalance,
        Math.abs(debtor.netBalance)
      );

      settlements.push({
        from: debtor.memberId,
        to: creditor.memberId,
        amount
      });

      creditor.netBalance -= amount;
      debtor.netBalance += amount;

      if (creditor.netBalance === 0) creditorIdx++;
      if (debtor.netBalance === 0) debtorIdx++;
    }

    return settlements;
  }
}

// routes/expenseRoutes.ts
router.post('/groups/:groupId/expenses', async (req, res) => {
  try {
    const { description, amount, category, paidBy, splitType, participants, date } = req.body;

    // Validate
    if (amount <= 0) throw new Error('Amount must be positive');
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant required');
    }

    // Check authorization
    const member = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: req.params.groupId,
          userId: req.user.id
        }
      }
    });
    if (!member) throw new Error('Not authorized');

    // Calculate shares
    const shares = ExpenseService.calculateShares({
      amount,
      splitType,
      participants
    });

    // Create expense
    const expense = await db.expense.create({
      data: {
        groupId: req.params.groupId,
        description,
        amount,
        category,
        paidBy,
        splitType,
        expenseDate: new Date(date),
        shares: {
          createMany: {
            data: Object.entries(shares).map(([userId, shareAmount]) => ({
              userId,
              amount: shareAmount
            }))
          }
        }
      },
      include: { shares: true }
    });

    // Regenerate settlements
    const settlementService = new SettlementService();
    await settlementService.generateSettlements(req.params.groupId);

    res.json({ success: true, expense });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

---

## ✅ Best Practices

### 1. **Money Handling**
```javascript
// ✅ DO: Use integers
const amountPaise = 10050;  // ₹100.50

// ❌ DON'T: Use floats
const amountRupees = 100.50;  // Floating point errors!
```

### 2. **Always Validate on Backend**
```javascript
// ❌ DON'T: Trust frontend calculations
const balanceFromFrontend = 5000;

// ✅ DO: Recalculate on backend
const serverBalance = calculateBalance(expenses, user);
```

### 3. **Handle Rounding Carefully**
```javascript
// ✅ DO: Ensure shares sum to exact amount
const shares = {};
const baseShare = Math.floor(amount / count);
const remainder = amount - (baseShare * count);
shares[first] = baseShare + remainder;  // Add remainder to first

// Verify
const total = Object.values(shares).reduce((a,b) => a+b, 0);
if (total !== amount) throw new Error('Rounding error');
```

### 4. **Transaction Safety**
```javascript
// ✅ DO: Use database transactions
await db.$transaction(async (tx) => {
  const expense = await tx.expense.create({...});
  const shares = await tx.expenseShare.createMany({...});
  const settlements = await tx.settlement.deleteMany({where: {groupId}});
  // If any fails, all rollback
});
```

### 5. **Authorization Checks**
```javascript
// ✅ DO: Always verify user belongs to group
const member = await db.groupMember.findUnique({
  where: {
    groupId_userId: { groupId, userId: req.user.id }
  }
});
if (!member) throw new Error('Not authorized');
```

---

## ⚠️ Common Pitfalls

### 1. Floating Point Precision
```javascript
// ❌ WRONG
10.50 + 20.30 === 30.80  // false!
// Reason: 10.50 → 10.500000000000002

// ✅ CORRECT
1050 + 2030 === 3080     // true
```

### 2. Missing Validation
```javascript
// ❌ WRONG
const shares = parseFloat(input);  // Could be "10.5abc"

// ✅ CORRECT
const shares = parseInt(input);
if (!Number.isInteger(shares) || shares <= 0) {
  throw new Error('Invalid input');
}
```

### 3. Rounding Errors
```javascript
// ❌ WRONG
[500/3, 500/3, 500/3] → [166, 166, 166] = 498 (not 500!)

// ✅ CORRECT
[floor(500/3) + 2, floor(500/3), floor(500/3)] → [168, 166, 166] = 500
```

### 4. Not Recalculating Balances
```javascript
// ❌ WRONG
// Expense is edited on frontend, settlements shown immediately
// But calculations not rechecked on backend

// ✅ CORRECT
// When expense is edited/deleted:
updateExpense(expenseId, newData) {
  // Update expense
  // Recalculate ALL balances for the group
  // Regenerate settlements
  // Notify all users
}
```

### 5. Missing Null Checks
```javascript
// ❌ WRONG
const share = expense.shares.find(s => s.userId === userId).amount;

// ✅ CORRECT
const share = expense.shares.find(s => s.userId === userId)?.amount || 0;
```

---

## 🧪 Testing Checklist

- [ ] Equal split produces correct amounts
- [ ] Custom split validates total equals expense
- [ ] Percentage split validates sum equals 100%
- [ ] Rounding produces exact totals
- [ ] Balance calculation is correct
- [ ] Settlement optimization is minimal (fewest transactions)
- [ ] Budget percentage calculation is accurate
- [ ] Analytics aggregation is correct
- [ ] Authorization blocks unauthorized access
- [ ] Expense deletion recalculates balances
- [ ] Expense editing regenerates settlements

---

## 📚 References

- [How to Handle Money in Programming](https://stackoverflow.com/questions/3730019/how-to-represent-money-in-computer-science)
- [Prisma ORM Documentation](https://www.prisma.io/docs/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [REST API Best Practices](https://restfulapi.net/)

---

*This technical guide provides the foundation for implementing SmartSplit's backend in Node.js/Express and PostgreSQL.*
