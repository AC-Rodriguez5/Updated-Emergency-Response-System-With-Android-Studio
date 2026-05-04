import { useState } from 'react';
import { 
  Heart, 
  Flame, 
  Shield, 
  Car, 
  CloudRain, 
  AlertTriangle,
  Send 
} from 'lucide-react';
import type { EmergencyCategory } from '../types';

interface Props {
  onEmergencySelect: (category: EmergencyCategory, message?: string) => void;
  hasContacts: boolean;
}

export function EmergencyCategories({ onEmergencySelect, hasContacts }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<EmergencyCategory | null>(null);
  const [additionalMessage, setAdditionalMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const categories = [
    {
      id: 'medical' as EmergencyCategory,
      label: 'Medical Emergency',
      icon: Heart,
      color: 'bg-red-500',
      hoverColor: 'hover:bg-red-600',
    },
    {
      id: 'fire' as EmergencyCategory,
      label: 'Fire',
      icon: Flame,
      color: 'bg-orange-500',
      hoverColor: 'hover:bg-orange-600',
    },
    {
      id: 'crime' as EmergencyCategory,
      label: 'Crime/Threat',
      icon: Shield,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
    },
    {
      id: 'accident' as EmergencyCategory,
      label: 'Accident',
      icon: Car,
      color: 'bg-yellow-500',
      hoverColor: 'hover:bg-yellow-600',
    },
    {
      id: 'natural-disaster' as EmergencyCategory,
      label: 'Natural Disaster',
      icon: CloudRain,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
    },
    {
      id: 'other' as EmergencyCategory,
      label: 'Other Emergency',
      icon: AlertTriangle,
      color: 'bg-gray-500',
      hoverColor: 'hover:bg-gray-600',
    },
  ];

  const handleCategoryClick = (category: EmergencyCategory) => {
    if (!hasContacts) {
      alert('Please add emergency contacts first');
      return;
    }
    setSelectedCategory(category);
    setShowConfirm(true);
  };

  const handleSendAlert = () => {
    if (selectedCategory) {
      onEmergencySelect(selectedCategory, additionalMessage || undefined);
      setShowConfirm(false);
      setSelectedCategory(null);
      setAdditionalMessage('');
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setSelectedCategory(null);
    setAdditionalMessage('');
  };

  if (showConfirm && selectedCategory) {
    const category = categories.find(c => c.id === selectedCategory);
    const Icon = category?.icon || AlertTriangle;

    return (
      <div className="space-y-4">
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-center mb-4">
            <div className={`${category?.color} p-4 rounded-full text-white`}>
              <Icon className="w-12 h-12" />
            </div>
          </div>
          
          <h2 className="text-center mb-2">Confirm Emergency Alert</h2>
          <p className="text-center text-gray-600 mb-4">
            {category?.label}
          </p>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2">
              Additional Information (Optional)
            </label>
            <textarea
              value={additionalMessage}
              onChange={(e) => setAdditionalMessage(e.target.value)}
              placeholder="Describe the situation..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendAlert}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              Send Alert
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-red-600 mb-2">Emergency Alert</h2>
        <p className="text-gray-600">
          Select emergency type to send alert
        </p>
      </div>

      {!hasContacts && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-yellow-800 text-center">
            ⚠️ Please add emergency contacts before sending alerts
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {categories.map(category => {
          const Icon = category.icon;
          return (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className={`${category.color} ${category.hoverColor} text-white p-6 rounded-lg transition-all transform active:scale-95 shadow-lg flex flex-col items-center justify-center gap-3`}
            >
              <Icon className="w-10 h-10" />
              <span className="text-center">{category.label}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mt-6">
        <h3 className="mb-2">How it works</h3>
        <ul className="text-gray-600 space-y-2">
          <li>• Select emergency category</li>
          <li>• Your GPS location is automatically captured</li>
          <li>• Alert sent to your emergency contacts</li>
          <li>• Responders receive real-time notification</li>
        </ul>
      </div>
    </div>
  );
}
