import { 
  Radio, 
  Smartphone, 
  Cloud, 
  Server, 
  Wifi, 
  Database,
  MapPin,
  Users,
  AlertCircle,
  Zap,
  CheckCircle
} from 'lucide-react';

export function SystemArchitecture() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="mb-2">SafeAlert System Architecture</h1>
        <p className="text-gray-600">
          IoT-enabled emergency response system with GPS tracking and offline capabilities
        </p>
      </div>

      {/* System Flow Diagram */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4">System Flow</h2>
        
        <div className="space-y-6">
          {/* IoT Device Layer */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center">
              <Radio className="w-8 h-8 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3>IoT Panic Button</h3>
              <p className="text-gray-600">
                Microcontroller-based keychain device with button patterns, BLE module, and offline storage
              </p>
            </div>
          </div>

          <div className="ml-8 text-gray-400">↓ Bluetooth Low Energy</div>

          {/* Mobile App Layer */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3>Mobile Application</h3>
              <p className="text-gray-600">
                Receives button press → Captures GPS → Categorizes emergency → Stores offline
              </p>
            </div>
          </div>

          <div className="ml-8 text-gray-400">↓ HTTP/WebSocket (when online)</div>

          {/* Cloud/Server Layer */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 bg-green-100 rounded-lg flex items-center justify-center">
              <Cloud className="w-8 h-8 text-green-600" />
            </div>
            <div className="flex-1">
              <h3>Cloud Server / Database</h3>
              <p className="text-gray-600">
                Real-time alert processing, data storage, and distribution to responders
              </p>
            </div>
          </div>

          <div className="ml-8 text-gray-400">↓ Real-time updates</div>

          {/* Responder Dashboard Layer */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center">
              <Server className="w-8 h-8 text-red-600" />
            </div>
            <div className="flex-1">
              <h3>Responder Dashboard</h3>
              <p className="text-gray-600">
                Map view, alert list, statistics, and status management for emergency teams
              </p>
            </div>
          </div>

          <div className="ml-8 text-gray-400">↓ SMS/Push notifications</div>

          {/* Emergency Contacts */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center">
              <Users className="w-8 h-8 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3>Emergency Contacts</h3>
              <p className="text-gray-600">
                Family, friends, and designated responders receive instant notifications
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Radio className="w-6 h-6 text-purple-600" />
            <h3>IoT Panic Button</h3>
          </div>
          <ul className="space-y-2 text-gray-600">
            <li>• ESP32/Arduino microcontroller</li>
            <li>• BLE 5.0 communication</li>
            <li>• 6 button press patterns</li>
            <li>• 500mAh Li-Po battery</li>
            <li>• 30-day battery life</li>
            <li>• IP67 water resistant</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <MapPin className="w-6 h-6 text-blue-600" />
            <h3>GPS Integration</h3>
          </div>
          <ul className="space-y-2 text-gray-600">
            <li>• Real-time location tracking</li>
            <li>• &lt;10m accuracy (ideal conditions)</li>
            <li>• Continuous background tracking</li>
            <li>• A-GPS for faster lock</li>
            <li>• Location history storage</li>
            <li>• Google Maps integration</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Database className="w-6 h-6 text-green-600" />
            <h3>Offline Storage</h3>
          </div>
          <ul className="space-y-2 text-gray-600">
            <li>• SQLite local database</li>
            <li>• Alert queue management</li>
            <li>• Automatic sync on reconnect</li>
            <li>• Conflict resolution</li>
            <li>• Data integrity checks</li>
            <li>• Secure encryption</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Zap className="w-6 h-6 text-red-600" />
            <h3>Emergency Categories</h3>
          </div>
          <ul className="space-y-2 text-gray-600">
            <li>• Medical emergency</li>
            <li>• Fire incident</li>
            <li>• Crime/Threat (silent)</li>
            <li>• Vehicle accident</li>
            <li>• Natural disaster</li>
            <li>• General emergency</li>
          </ul>
        </div>
      </div>

      {/* Button Pattern Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4">Button Press Patterns</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">Pattern</th>
                <th className="text-left py-3 px-4">Visual</th>
                <th className="text-left py-3 px-4">Category</th>
                <th className="text-left py-3 px-4">Use Case</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4">Single Press</td>
                <td className="py-3 px-4 font-mono">●</td>
                <td className="py-3 px-4">Medical</td>
                <td className="py-3 px-4 text-gray-600">Heart attack, injury, illness</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4">Double Press</td>
                <td className="py-3 px-4 font-mono">● ●</td>
                <td className="py-3 px-4">Fire</td>
                <td className="py-3 px-4 text-gray-600">Building fire, smoke</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4">Long Press (3s)</td>
                <td className="py-3 px-4 font-mono">━━━</td>
                <td className="py-3 px-4">Crime/Threat</td>
                <td className="py-3 px-4 text-gray-600">Silent alert, robbery, assault</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4">Triple Press</td>
                <td className="py-3 px-4 font-mono">● ● ●</td>
                <td className="py-3 px-4">Accident</td>
                <td className="py-3 px-4 text-gray-600">Car crash, fall</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4">Double Long</td>
                <td className="py-3 px-4 font-mono">━━ ━━</td>
                <td className="py-3 px-4">Natural Disaster</td>
                <td className="py-3 px-4 text-gray-600">Earthquake, flood, typhoon</td>
              </tr>
              <tr>
                <td className="py-3 px-4">SOS Pattern</td>
                <td className="py-3 px-4 font-mono">●●● ━━━ ●●●</td>
                <td className="py-3 px-4">Other</td>
                <td className="py-3 px-4 text-gray-600">General emergency</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Technical Specifications */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4">Technical Specifications</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="mb-3">Hardware</h3>
            <ul className="space-y-2 text-gray-600">
              <li><strong>Microcontroller:</strong> ESP32-WROOM-32</li>
              <li><strong>Communication:</strong> Bluetooth LE 5.0</li>
              <li><strong>Battery:</strong> 500mAh 3.7V Li-Po</li>
              <li><strong>Button:</strong> Tactile switch with debouncing</li>
              <li><strong>LED:</strong> Status indicator</li>
              <li><strong>Enclosure:</strong> ABS plastic, IP67 rated</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3">Software</h3>
            <ul className="space-y-2 text-gray-600">
              <li><strong>Firmware:</strong> Arduino/ESP-IDF</li>
              <li><strong>Mobile:</strong> React Native / Flutter</li>
              <li><strong>Backend:</strong> Node.js / Python</li>
              <li><strong>Database:</strong> PostgreSQL / MongoDB</li>
              <li><strong>Real-time:</strong> WebSocket / Firebase</li>
              <li><strong>Maps:</strong> Google Maps API</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4">Performance Targets</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="mb-2">
              <Zap className="w-8 h-8 text-yellow-600 mx-auto" />
            </div>
            <p className="text-gray-900 mb-1">&lt; 3 seconds</p>
            <p className="text-gray-600">Alert transmission</p>
          </div>

          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="mb-2">
              <MapPin className="w-8 h-8 text-blue-600 mx-auto" />
            </div>
            <p className="text-gray-900 mb-1">&lt; 10 meters</p>
            <p className="text-gray-600">GPS accuracy</p>
          </div>

          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="mb-2">
              <Wifi className="w-8 h-8 text-green-600 mx-auto" />
            </div>
            <p className="text-gray-900 mb-1">30 meters</p>
            <p className="text-gray-600">BLE range</p>
          </div>

          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="mb-2">
              <CheckCircle className="w-8 h-8 text-purple-600 mx-auto" />
            </div>
            <p className="text-gray-900 mb-1">99.9%</p>
            <p className="text-gray-600">Uptime target</p>
          </div>
        </div>
      </div>
    </div>
  );
}