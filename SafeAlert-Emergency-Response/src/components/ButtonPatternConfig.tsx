import { useState } from 'react';
import { 
  Heart, 
  Flame, 
  Shield, 
  Car, 
  CloudRain, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import type { ButtonPattern, EmergencyCategory } from '../types';

export function ButtonPatternConfig() {
  const [isExpanded, setIsExpanded] = useState(false);

  const patterns: ButtonPattern[] = [
    {
      category: 'medical',
      pattern: 'single',
      description: 'Single press - Medical emergency',
    },
    {
      category: 'fire',
      pattern: 'double',
      description: 'Double press - Fire emergency',
    },
    {
      category: 'crime',
      pattern: 'long-press',
      description: 'Long press (3s) - Silent crime/threat alert',
    },
    {
      category: 'accident',
      pattern: 'triple',
      description: 'Triple press - Accident or injury',
    },
    {
      category: 'natural-disaster',
      pattern: 'double',
      description: 'Double long press - Natural disaster',
    },
    {
      category: 'other',
      pattern: 'sos',
      description: 'SOS pattern (3-3-3) - General emergency',
    },
  ];

  const getCategoryIcon = (category: EmergencyCategory) => {
    const icons = {
      medical: Heart,
      fire: Flame,
      crime: Shield,
      accident: Car,
      'natural-disaster': CloudRain,
      other: AlertTriangle,
    };
    return icons[category];
  };

  const getCategoryColor = (category: EmergencyCategory) => {
    const colors = {
      medical: 'bg-red-100 text-red-700 border-red-300',
      fire: 'bg-orange-100 text-orange-700 border-orange-300',
      crime: 'bg-purple-100 text-purple-700 border-purple-300',
      accident: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      'natural-disaster': 'bg-blue-100 text-blue-700 border-blue-300',
      other: 'bg-gray-100 text-gray-700 border-gray-300',
    };
    return colors[category];
  };

  const getPatternVisual = (pattern: ButtonPattern['pattern']) => {
    const visuals = {
      single: '●',
      double: '● ●',
      triple: '● ● ●',
      'long-press': '━━━',
      sos: '●●● ━━━ ●●●',
    };
    return visuals[pattern];
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          <span>Button Press Patterns</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 p-4">
          <p className="text-gray-600 mb-4">
            Configure different button press patterns on your IoT device to trigger specific emergency categories:
          </p>

          <div className="space-y-3">
            {patterns.map((pattern) => {
              const Icon = getCategoryIcon(pattern.category);
              
              return (
                <div
                  key={pattern.category}
                  className={`border rounded-lg p-3 ${getCategoryColor(pattern.category)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="capitalize">{pattern.category.replace('-', ' ')}</h4>
                        <span className="font-mono px-2 py-1 bg-white bg-opacity-50 rounded">
                          {getPatternVisual(pattern.pattern)}
                        </span>
                      </div>
                      <p className="text-sm opacity-90">{pattern.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="mb-2">Pattern Guide:</p>
                <ul className="space-y-1 ml-4">
                  <li>• Press patterns are detected within 2 seconds</li>
                  <li>• Long press = hold for 3+ seconds</li>
                  <li>• SOS pattern = 3 quick, pause, 3 quick, pause, 3 quick</li>
                  <li>• Failed pattern defaults to general emergency</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
