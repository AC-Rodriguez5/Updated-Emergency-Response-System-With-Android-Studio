import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import type { Alert } from '../types';

interface Props {
  alerts: Alert[];
}

export function AlertStats({ alerts }: Props) {
  // Category distribution
  const categoryData = alerts.reduce((acc, alert) => {
    const category = alert.category;
    const existing = acc.find(item => item.name === category);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: category, value: 1 });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  const categoryLabels: Record<string, string> = {
    'medical': 'Medical',
    'fire': 'Fire',
    'crime': 'Crime/Threat',
    'accident': 'Accident',
    'natural-disaster': 'Natural Disaster',
    'other': 'Other',
  };

  const categoryChartData = categoryData.map(item => ({
    name: categoryLabels[item.name] || item.name,
    count: item.value,
  }));

  // Status distribution
  const statusData = [
    { name: 'Active', value: alerts.filter(a => a.status === 'active').length },
    { name: 'Acknowledged', value: alerts.filter(a => a.status === 'acknowledged').length },
    { name: 'Resolved', value: alerts.filter(a => a.status === 'resolved').length },
  ].filter(item => item.value > 0);

  // Timeline data (last 7 days)
  const timelineData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    date.setHours(0, 0, 0, 0);
    
    const dayStart = date.getTime();
    const dayEnd = dayStart + 86400000;
    
    const dayAlerts = alerts.filter(alert => 
      alert.timestamp >= dayStart && alert.timestamp < dayEnd
    );

    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: dayAlerts.length,
    };
  });

  const COLORS = {
    medical: '#ef4444',
    fire: '#f97316',
    crime: '#a855f7',
    accident: '#eab308',
    'natural-disaster': '#3b82f6',
    other: '#6b7280',
    Active: '#ef4444',
    Acknowledged: '#3b82f6',
    Resolved: '#22c55e',
  };

  const stats = {
    total: alerts.length,
    active: alerts.filter(a => a.status === 'active').length,
    avgResponseTime: '4.2 min', // Mock data
    resolvedToday: alerts.filter(a => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return a.status === 'resolved' && a.timestamp >= today.getTime();
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-gray-600 mb-2">Total Alerts</p>
          <p className="text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-gray-600 mb-2">Active Alerts</p>
          <p className="text-red-600">{stats.active}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-gray-600 mb-2">Avg Response Time</p>
          <p className="text-gray-900">{stats.avgResponseTime}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-gray-600 mb-2">Resolved Today</p>
          <p className="text-green-600">{stats.resolvedToday}</p>
        </div>
      </div>

      {/* Charts */}
      {alerts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Distribution */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="mb-4">Alerts by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status Distribution */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="mb-4">Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Timeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
            <h3 className="mb-4">Alert Timeline (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="Alerts" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Category Breakdown Table */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
            <h3 className="mb-4">Detailed Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4">Category</th>
                    <th className="text-left py-3 px-4">Total</th>
                    <th className="text-left py-3 px-4">Active</th>
                    <th className="text-left py-3 px-4">Acknowledged</th>
                    <th className="text-left py-3 px-4">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(categoryLabels).map(category => {
                    const categoryAlerts = alerts.filter(a => a.category === category);
                    if (categoryAlerts.length === 0) return null;
                    
                    return (
                      <tr key={category} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">{categoryLabels[category]}</td>
                        <td className="py-3 px-4">{categoryAlerts.length}</td>
                        <td className="py-3 px-4 text-red-600">
                          {categoryAlerts.filter(a => a.status === 'active').length}
                        </td>
                        <td className="py-3 px-4 text-blue-600">
                          {categoryAlerts.filter(a => a.status === 'acknowledged').length}
                        </td>
                        <td className="py-3 px-4 text-green-600">
                          {categoryAlerts.filter(a => a.status === 'resolved').length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500">No data available</p>
          <p className="text-gray-400">Statistics will appear once alerts are received</p>
        </div>
      )}
    </div>
  );
}
