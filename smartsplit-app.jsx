import React, { useState, useEffect, useContext, createContext } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Home, Users, DollarSign, BarChart3, Settings, LogOut, Menu, X, Eye, EyeOff, Trash2, Edit2, Check, AlertCircle, TrendingUp } from 'lucide-react';

// ============================================================================
// CORE BUSINESS LOGIC & ALGORITHMS
// ============================================================================

class ExpenseService {
  static calculateShares(expense) {
    const { amount, splitType, participants, splits } = expense;
    const shares = {};
    
    participants.forEach(pid => {
      shares[pid] = 0;
    });

    if (splitType === 'EQUAL') {
      const shareAmount = Math.round(amount / participants.length);
      const remainder = amount - (shareAmount * participants.length);
      
      participants.forEach((pid, idx) => {
        shares[pid] = shareAmount + (idx === 0 ? remainder : 0);
      });
    } else if (splitType === 'CUSTOM') {
      participants.forEach(pid => {
        shares[pid] = splits[pid] || 0;
      });
    } else if (splitType === 'PERCENTAGE') {
      participants.forEach(pid => {
        shares[pid] = Math.round((amount * (splits[pid] || 0)) / 100);
      });
    } else if (splitType === 'SHARES') {
      const totalShares = participants.reduce((sum, pid) => sum + (splits[pid] || 1), 0);
      const valuePerShare = Math.round(amount / totalShares);
      
      participants.forEach(pid => {
        shares[pid] = valuePerShare * (splits[pid] || 1);
      });
    }
    
    return shares;
  }
}

class BalanceService {
  static calculateGroupBalances(expenses, groupMembers) {
    const balances = {};
    
    groupMembers.forEach(member => {
      balances[member.id] = {
        memberId: member.id,
        name: member.name,
        totalPaid: 0,
        totalShare: 0,
      };
    });

    expenses.forEach(expense => {
      const shares = ExpenseService.calculateShares(expense);
      
      if (balances[expense.paidBy]) {
        balances[expense.paidBy].totalPaid += expense.amount;
      }
      
      Object.entries(shares).forEach(([userId, share]) => {
        if (balances[userId]) {
          balances[userId].totalShare += share;
        }
      });
    });

    Object.values(balances).forEach(balance => {
      balance.netBalance = balance.totalPaid - balance.totalShare;
    });

    return Object.values(balances);
  }
}

class SettlementService {
  static generateSettlementPlan(balances) {
    const creditors = [];
    const debtors = [];
    
    balances.forEach(balance => {
      if (balance.netBalance > 0) {
        creditors.push({ ...balance, remaining: balance.netBalance });
      } else if (balance.netBalance < 0) {
        debtors.push({ ...balance, remaining: Math.abs(balance.netBalance) });
      }
    });

    const settlements = [];
    let creditorIdx = 0;
    let debtorIdx = 0;

    while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
      const creditor = creditors[creditorIdx];
      const debtor = debtors[debtorIdx];
      
      const amount = Math.min(creditor.remaining, debtor.remaining);
      
      if (amount > 0) {
        settlements.push({
          from: debtor.memberId,
          fromName: debtor.name,
          to: creditor.memberId,
          toName: creditor.name,
          amount,
          status: 'PENDING'
        });
      }
      
      creditor.remaining -= amount;
      debtor.remaining -= amount;
      
      if (creditor.remaining === 0) creditorIdx++;
      if (debtor.remaining === 0) debtorIdx++;
    }

    return settlements;
  }
}

class AnalyticsService {
  static calculateGroupAnalytics(expenses, balances, budget) {
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const categorySpending = {};
    const memberSpending = {};
    const dateSpending = {};

    expenses.forEach(expense => {
      categorySpending[expense.category] = (categorySpending[expense.category] || 0) + expense.amount;
      memberSpending[expense.paidBy] = (memberSpending[expense.paidBy] || 0) + expense.amount;
      
      const date = new Date(expense.date).toLocaleDateString();
      dateSpending[date] = (dateSpending[date] || 0) + expense.amount;
    });

    const budgetUsagePercent = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0;
    const remainingBudget = Math.max(0, budget - totalSpent);

    return {
      totalSpent,
      expenseCount: expenses.length,
      averageExpense: expenses.length > 0 ? Math.round(totalSpent / expenses.length) : 0,
      largestExpense: Math.max(...expenses.map(e => e.amount), 0),
      categorySpending,
      memberSpending,
      dateSpending,
      budgetUsagePercent,
      remainingBudget,
      budgetStatus: budgetUsagePercent < 70 ? 'NORMAL' : budgetUsagePercent < 90 ? 'WARNING' : budgetUsagePercent < 100 ? 'CRITICAL' : 'EXCEEDED'
    };
  }

  static generateInsights(analytics, expenses, settlements) {
    const insights = [];

    if (analytics.totalSpent > 0) {
      const topCategory = Object.entries(analytics.categorySpending).sort((a, b) => b[1] - a[1])[0];
      if (topCategory && topCategory[1] > analytics.totalSpent * 0.35) {
        insights.push(`💡 ${topCategory[0]} is your largest spending category at ${Math.round((topCategory[1] / analytics.totalSpent) * 100)}%`);
      }
    }

    if (analytics.budgetUsagePercent >= 90 && analytics.budgetUsagePercent < 100) {
      insights.push(`⚠️ You're close to budget limit (${analytics.budgetUsagePercent}% used)`);
    } else if (analytics.budgetUsagePercent >= 100) {
      insights.push(`🔴 Budget exceeded by ₹${analytics.budgetStatus === 'EXCEEDED' ? analytics.totalSpent - analytics.remainingBudget : 0}`);
    }

    const pendingSettlements = settlements.filter(s => s.status === 'PENDING').length;
    if (pendingSettlements > 0) {
      insights.push(`📊 ${pendingSettlements} settlement(s) pending`);
    }

    return insights;
  }
}

// ============================================================================
// STATE MANAGEMENT - CONTEXT
// ============================================================================

const AppContext = createContext();

function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);

  // Mock authentication
  const login = (email, password) => {
    const user = {
      id: '1',
      name: email.split('@')[0],
      email,
      avatar: '👤'
    };
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };

  const createGroup = (groupData) => {
    const newGroup = {
      id: Date.now().toString(),
      ...groupData,
      createdBy: currentUser.id,
      members: [{ id: currentUser.id, name: currentUser.name, role: 'ADMIN' }],
      createdAt: new Date()
    };
    setGroups([...groups, newGroup]);
    return newGroup;
  };

  const addExpense = (groupId, expenseData) => {
    const newExpense = {
      id: Date.now().toString(),
      groupId,
      ...expenseData,
      createdAt: new Date()
    };
    setExpenses([...expenses, newExpense]);
    
    // Auto-generate settlements
    const groupExpenses = [...expenses, newExpense].filter(e => e.groupId === groupId);
    const currentGroup = groups.find(g => g.id === groupId);
    const balances = BalanceService.calculateGroupBalances(groupExpenses, currentGroup.members);
    const newSettlements = SettlementService.generateSettlementPlan(balances);
    setSettlements(newSettlements);
    
    return newExpense;
  };

  const markSettlementPaid = (settlementIndex) => {
    const updated = [...settlements];
    updated[settlementIndex].status = 'COMPLETED';
    setSettlements(updated);
  };

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser, login, logout,
      groups, setGroups, createGroup,
      currentGroupId, setCurrentGroupId,
      expenses, setExpenses, addExpense,
      settlements, setSettlements, markSettlementPaid
    }}>
      {children}
    </AppContext.Provider>
  );
}

const useApp = () => useContext(AppContext);

// ============================================================================
// COMPONENTS
// ============================================================================

function LoginRegister() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('rahul@example.com');
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useApp();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email && password) {
      login(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            SmartSplit
          </div>
          <p className="text-gray-600">Smart Expense Sharing</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-500"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>Demo Account:</strong><br/>
            Email: rahul@example.com<br/>
            Password: password
          </p>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const { currentUser, logout, groups, currentGroupId, setCurrentGroupId } = useApp();

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:static w-64 h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white transform lg:transform-none transition-transform z-40 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl">💰</div>
            <div>
              <div className="font-bold text-lg">SmartSplit</div>
              <div className="text-xs text-slate-400">Expense Manager</div>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1">
          <NavLink icon={<Home size={20} />} label="Dashboard" href="dashboard" />
          <NavLink icon={<Users size={20} />} label="Groups" href="groups" />
          <NavLink icon={<BarChart3 size={20} />} label="Analytics" href="analytics" />
          <NavLink icon={<Settings size={20} />} label="Settings" href="settings" />
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-lg">
              {currentUser?.avatar || '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-sm truncate">{currentUser?.name}</div>
              <div className="text-xs text-slate-400 truncate">{currentUser?.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-700 text-sm transition"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

function NavLink({ icon, label, href }) {
  return (
    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-700 transition text-left">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Dashboard() {
  const { currentUser, groups, expenses, settlements } = useApp();

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const youOwe = settlements
    .filter(s => s.from === currentUser.id && s.status === 'PENDING')
    .reduce((sum, s) => sum + s.amount, 0);
  const youAreOwed = settlements
    .filter(s => s.to === currentUser.id && s.status === 'PENDING')
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {currentUser?.name} 👋</h1>
        <p className="text-gray-600 mt-2">Here's your expense overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Groups"
          value={groups.length}
          icon="👥"
          color="blue"
        />
        <StatCard
          title="Total Spending"
          value={`₹${totalSpent.toLocaleString()}`}
          icon="💸"
          color="green"
        />
        <StatCard
          title="You Owe"
          value={`₹${youOwe.toLocaleString()}`}
          icon="📤"
          color="red"
        />
        <StatCard
          title="You're Owed"
          value={`₹${youAreOwed.toLocaleString()}`}
          icon="📥"
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">Recent Groups</h2>
          <div className="space-y-3">
            {groups.slice(0, 3).map(group => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">Quick Stats</h2>
          <div className="space-y-4">
            <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
              <div className="text-sm text-gray-600">Total Expenses</div>
              <div className="text-2xl font-bold text-blue-600">{expenses.length}</div>
            </div>
            <div className="p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg">
              <div className="text-sm text-gray-600">Settled</div>
              <div className="text-2xl font-bold text-green-600">
                {settlements.filter(s => s.status === 'COMPLETED').length}
              </div>
            </div>
            <div className="p-3 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg">
              <div className="text-sm text-gray-600">Pending</div>
              <div className="text-2xl font-bold text-orange-600">
                {settlements.filter(s => s.status === 'PENDING').length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'from-blue-50 to-indigo-50 border-blue-200',
    green: 'from-green-50 to-emerald-50 border-green-200',
    red: 'from-red-50 to-orange-50 border-red-200',
    purple: 'from-purple-50 to-pink-50 border-purple-200'
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-6 shadow-sm hover:shadow-md transition`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}

function GroupCard({ group }) {
  const { expenses, currentGroupId, setCurrentGroupId } = useApp();
  const groupExpenses = expenses.filter(e => e.groupId === group.id);
  const totalSpent = groupExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div
      onClick={() => setCurrentGroupId(group.id)}
      className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{group.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{group.members.length} members • {groupExpenses.length} expenses</p>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-900">₹{totalSpent.toLocaleString()}</div>
          <div className="text-xs text-gray-500">spent</div>
        </div>
      </div>
    </div>
  );
}

function GroupsList() {
  const { groups, currentUser } = useApp();
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Groups</h1>
          <p className="text-gray-600 mt-1">Manage your expense groups</p>
        </div>
        <button
          onClick={() => setShowCreateGroup(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition font-medium"
        >
          <Plus size={20} />
          New Group
        </button>
      </div>

      {showCreateGroup && (
        <CreateGroupModal onClose={() => setShowCreateGroup(false)} />
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No groups yet"
          description="Create your first group to start splitting expenses"
          actionLabel="Create Group"
          onAction={() => setShowCreateGroup(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(group => (
            <GroupDetailCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroupModal({ onClose }) {
  const { createGroup } = useApp();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    currency: 'INR',
    budget: 50000
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createGroup(formData);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Group</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Goa Trip 2026"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What's this group for?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              rows="3"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option>INR</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Budget ({formData.currency})</label>
              <input
                type="number"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition font-medium"
            >
              Create Group
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function GroupDetailCard({ group }) {
  const { expenses, setCurrentGroupId } = useApp();
  const groupExpenses = expenses.filter(e => e.groupId === group.id);
  const totalSpent = groupExpenses.reduce((sum, e) => sum + e.amount, 0);
  const budgetPercent = group.budget > 0 ? Math.round((totalSpent / group.budget) * 100) : 0;

  return (
    <div
      onClick={() => setCurrentGroupId(group.id)}
      className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition cursor-pointer border border-gray-100"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{group.name}</h3>
          <p className="text-sm text-gray-600 mt-1">{group.description}</p>
        </div>
        <div className="text-2xl">👥</div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Members</span>
          <span className="font-semibold text-gray-900">{group.members.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Expenses</span>
          <span className="font-semibold text-gray-900">{groupExpenses.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total Spent</span>
          <span className="font-semibold text-gray-900">₹{totalSpent.toLocaleString()}</span>
        </div>

        <div className="pt-3 border-t border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Budget Progress</span>
            <span className="text-sm font-semibold text-gray-900">{budgetPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                budgetPercent < 70 ? 'bg-green-500' :
                budgetPercent < 90 ? 'bg-yellow-500' :
                budgetPercent < 100 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpenseManagement() {
  const { currentGroupId, groups, expenses, addExpense } = useApp();
  const [showAddExpense, setShowAddExpense] = useState(false);

  if (!currentGroupId) {
    return (
      <EmptyState
        icon="👥"
        title="No group selected"
        description="Select a group to view and manage expenses"
      />
    );
  }

  const currentGroup = groups.find(g => g.id === currentGroupId);
  const groupExpenses = expenses.filter(e => e.groupId === currentGroupId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{currentGroup?.name}</h1>
          <p className="text-gray-600 mt-1">Manage group expenses</p>
        </div>
        <button
          onClick={() => setShowAddExpense(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition font-medium"
        >
          <Plus size={20} />
          Add Expense
        </button>
      </div>

      {showAddExpense && (
        <AddExpenseModal
          group={currentGroup}
          onClose={() => setShowAddExpense(false)}
        />
      )}

      {groupExpenses.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No expenses yet"
          description="Add your first expense to start tracking"
          actionLabel="Add Expense"
          onAction={() => setShowAddExpense(true)}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Description</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Paid By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {groupExpenses.map(expense => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{expense.description}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">₹{expense.amount}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{expense.paidBy}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(expense.date).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddExpenseModal({ group, onClose }) {
  const { addExpense } = useApp();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    category: 'Food',
    paidBy: group.members[0].id,
    splitType: 'EQUAL',
    participants: group.members.map(m => m.id),
    splits: {},
    date: new Date().toISOString().split('T')[0]
  });

  const handleAddExpense = () => {
    addExpense(group.id, formData);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Expense</h2>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Hotel Booking"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount (₹)</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                placeholder="10000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option>Food</option>
                  <option>Accommodation</option>
                  <option>Transport</option>
                  <option>Entertainment</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Paid By</label>
                <select
                  value={formData.paidBy}
                  onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {group.members.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Split Type</label>
              <div className="space-y-2">
                {['EQUAL', 'CUSTOM', 'PERCENTAGE', 'SHARES'].map(type => (
                  <label key={type} className="flex items-center gap-3 p-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      checked={formData.splitType === type}
                      onChange={() => setFormData({ ...formData, splitType: type })}
                      className="w-4 h-4"
                    />
                    <span className="font-medium text-gray-900">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Participants</label>
              <div className="space-y-2">
                {group.members.map(member => (
                  <label key={member.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.participants.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({
                            ...formData,
                            participants: [...formData.participants, member.id]
                          });
                        } else {
                          setFormData({
                            ...formData,
                            participants: formData.participants.filter(id => id !== member.id)
                          });
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-gray-900">{member.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAddExpense}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition font-medium"
              >
                Add Expense
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SettlementsView() {
  const { currentGroupId, groups, expenses, settlements, markSettlementPaid } = useApp();

  if (!currentGroupId) {
    return (
      <EmptyState
        icon="👥"
        title="No group selected"
        description="Select a group to view settlements"
      />
    );
  }

  const currentGroup = groups.find(g => g.id === currentGroupId);
  const groupExpenses = expenses.filter(e => e.groupId === currentGroupId);
  const balances = BalanceService.calculateGroupBalances(groupExpenses, currentGroup.members);

  const pendingSettlements = settlements.filter(s => s.status === 'PENDING');
  const completedSettlements = settlements.filter(s => s.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settlements</h1>
        <p className="text-gray-600 mt-1">View and manage payment settlements</p>
      </div>

      {/* Member Balances */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Member Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(balance => (
            <div key={balance.memberId} className={`p-4 rounded-lg border-2 ${
              balance.netBalance > 0
                ? 'border-green-200 bg-green-50'
                : balance.netBalance < 0
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="font-semibold text-gray-900">{balance.name}</div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Paid:</span>
                  <span>₹{balance.totalPaid}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Share:</span>
                  <span>₹{balance.totalShare}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t-2 border-current">
                <div className={`font-bold text-lg ${
                  balance.netBalance > 0
                    ? 'text-green-600'
                    : balance.netBalance < 0
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}>
                  {balance.netBalance > 0 ? '↓ ' : balance.netBalance < 0 ? '↑ ' : ''}
                  ₹{Math.abs(balance.netBalance)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settlement Plan */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Settlement Plan</h2>
          <div className="text-sm font-medium text-gray-600">
            {pendingSettlements.length} pending
          </div>
        </div>

        {pendingSettlements.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Check size={48} className="mx-auto mb-2 text-green-500" />
            <p>Everyone is settled! 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingSettlements.map((settlement, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {settlement.fromName} → {settlement.toName}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">₹{settlement.amount}</div>
                </div>
                <button
                  onClick={() => markSettlementPaid(settlements.indexOf(settlement))}
                  className="ml-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium text-sm"
                >
                  Mark Paid
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Settlements */}
      {completedSettlements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Completed Settlements</h2>
          <div className="space-y-2">
            {completedSettlements.map((settlement, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-3">
                  <Check size={20} className="text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {settlement.fromName} → {settlement.toName}
                    </div>
                    <div className="text-xs text-gray-600">₹{settlement.amount}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetManagement() {
  const { currentGroupId, groups, expenses } = useApp();

  if (!currentGroupId) {
    return (
      <EmptyState
        icon="👥"
        title="No group selected"
        description="Select a group to view budget"
      />
    );
  }

  const currentGroup = groups.find(g => g.id === currentGroupId);
  const groupExpenses = expenses.filter(e => e.groupId === currentGroupId);
  const totalSpent = groupExpenses.reduce((sum, e) => sum + e.amount, 0);
  const budgetPercent = currentGroup.budget > 0 ? Math.round((totalSpent / currentGroup.budget) * 100) : 0;

  const categorySpending = {};
  groupExpenses.forEach(expense => {
    categorySpending[expense.category] = (categorySpending[expense.category] || 0) + expense.amount;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Budget</h1>
        <p className="text-gray-600 mt-1">Track your group's spending against budget</p>
      </div>

      {/* Overall Budget */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Overall Budget</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <div className="text-sm text-gray-600">Total Budget</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">₹{currentGroup.budget.toLocaleString()}</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-orange-50 to-red-50 rounded-lg border border-orange-200">
            <div className="text-sm text-gray-600">Total Spent</div>
            <div className="text-3xl font-bold text-orange-600 mt-2">₹{totalSpent.toLocaleString()}</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <div className="text-sm text-gray-600">Remaining</div>
            <div className="text-3xl font-bold text-green-600 mt-2">₹{(currentGroup.budget - totalSpent).toLocaleString()}</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-3">
            <span className="font-semibold text-gray-900">Budget Usage</span>
            <span className="text-2xl font-bold text-gray-900">{budgetPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all ${
                budgetPercent < 70 ? 'bg-green-500' :
                budgetPercent < 90 ? 'bg-yellow-500' :
                budgetPercent < 100 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
          <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-sm font-medium text-blue-900">
              {budgetPercent < 70
                ? '✅ On track - within budget'
                : budgetPercent < 90
                ? '⚠️ Warning - approaching limit'
                : budgetPercent < 100
                ? '🔴 Critical - nearing limit'
                : '🚨 Exceeded - over budget'}
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Spending by Category</h2>
        <div className="space-y-3">
          {Object.entries(categorySpending).map(([category, amount]) => (
            <div key={category}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-900">{category}</span>
                <span className="font-bold text-gray-900">₹{amount.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                  style={{ width: `${Math.round((amount / totalSpent) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Analytics() {
  const { currentGroupId, groups, expenses } = useApp();

  if (!currentGroupId) {
    return (
      <EmptyState
        icon="📊"
        title="No group selected"
        description="Select a group to view analytics"
      />
    );
  }

  const currentGroup = groups.find(g => g.id === currentGroupId);
  const groupExpenses = expenses.filter(e => e.groupId === currentGroupId);
  const analytics = AnalyticsService.calculateGroupAnalytics(groupExpenses, null, currentGroup.budget);

  // Prepare chart data
  const categoryData = Object.entries(analytics.categorySpending).map(([name, value]) => ({
    name,
    value
  }));

  const memberData = Object.entries(analytics.memberSpending).map(([memberId, value]) => {
    const member = currentGroup.members.find(m => m.id === memberId);
    return {
      name: member?.name || 'Unknown',
      value
    };
  });

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">Detailed spending insights and statistics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Spending"
          value={`₹${analytics.totalSpent.toLocaleString()}`}
          icon="💸"
          color="blue"
        />
        <StatCard
          title="Number of Expenses"
          value={analytics.expenseCount}
          icon="📝"
          color="green"
        />
        <StatCard
          title="Average Expense"
          value={`₹${analytics.averageExpense.toLocaleString()}`}
          icon="📊"
          color="yellow"
        />
        <StatCard
          title="Largest Expense"
          value={`₹${analytics.largestExpense.toLocaleString()}`}
          icon="📈"
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categoryData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Spending by Category</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ₹${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₹${value}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {memberData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Spending by Member</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={memberData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${value}`} />
                <Bar dataKey="value" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account preferences</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-4">App Settings</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <div className="font-medium text-gray-900">Dark Mode</div>
              <div className="text-sm text-gray-600">Enable dark theme</div>
            </div>
            <input type="checkbox" className="w-5 h-5" />
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <div className="font-medium text-gray-900">Notifications</div>
              <div className="text-sm text-gray-600">Get updates about expenses</div>
            </div>
            <input type="checkbox" defaultChecked className="w-5 h-5" />
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <div className="font-medium text-gray-900">Email Digest</div>
              <div className="text-sm text-gray-600">Weekly spending summary</div>
            </div>
            <input type="checkbox" className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition font-medium"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="relative max-h-screen overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute -top-10 -right-10 text-white hover:text-gray-300 lg:hidden"
        >
          <X size={32} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { currentUser } = useApp();

  if (!currentUser) {
    return <LoginRegister />;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 lg:hidden z-30">
          <div className="flex items-center justify-between p-4">
            <div className="text-lg font-bold text-gray-900">SmartSplit</div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'groups' && <GroupsList />}
          {currentPage === 'expenses' && <ExpenseManagement />}
          {currentPage === 'settlements' && <SettlementsView />}
          {currentPage === 'budget' && <BudgetManagement />}
          {currentPage === 'analytics' && <Analytics />}
          {currentPage === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}

export default function MainApp() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}
