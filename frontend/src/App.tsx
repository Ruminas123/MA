import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import './App.css';

// Define types
interface IpStatus {
  [key: string]: string;
}

interface Location {
  position: [number, number];
  name: string;
  ip: string;
}

function App() {
  const [ipStatuses, setIpStatuses] = useState<IpStatus>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false); // Set initial state to false

  // Coordinates for multiple locations with associated IPs
  const locations: Location[] = [
    { position: [13.7367, 100.5231], name: "ชื่อสถานที่ A", ip: "192.168.100.1" },
    { position: [13.7563, 100.5018], name: "ชื่อสถานที่ B", ip: "192.168.100.2" },
    { position: [13.7100, 100.5399], name: "ชื่อสถานที่ C", ip: "192.168.100.3" },
    { position: [13.7300, 100.5399], name: "ชื่อสถานที่ D", ip: "192.168.100.4" },
  ];

  const generateIps = () => {
    const base = '192.168.100.';
    const ips: string[] = [];
    for (let i = 1; i <= 10; i++) {
      ips.push(base + i);
    }
    return ips;
  };

  const ipList = generateIps();

  const checkIps = async () => {
    setIsLoading(true);

    // Step 1: Set all statuses to "Checking..." immediately before calling the API
    const checkingStatuses: IpStatus = {};
    ipList.forEach(ip => {
      checkingStatuses[ip] = 'Checking...';
    });
    setIpStatuses(checkingStatuses); // Update the status to "Checking..."

    try {
      // Clear cache first before checking IPs
      await axios.post('http://localhost:5000/clear-cache');
      
      // Step 2: Make API call to check IP statuses
      const response = await axios.post('http://localhost:5000/check-ips', {
        ips: ipList
      });
      
      if (response.data && response.data.results) {
        // Step 3: Update the status with the actual result from API
        setIpStatuses(response.data.results);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error checking IPs:', error);
      const offlineStatuses: IpStatus = {};
      ipList.forEach(ip => {
        offlineStatuses[ip] = 'Error';
      });
      setIpStatuses(offlineStatuses);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    checkIps();
  };

  useEffect(() => {
    checkIps(); // Load data on initial render
    if (autoRefresh) {
      const intervalId = window.setInterval(() => {
        checkIps();
      }, 10 * 1000);
      return () => window.clearInterval(intervalId);
    }
    // Ensure that manual refresh button is enabled when auto-refresh is turned off
    setIsLoading(false);
  }, [autoRefresh]);

  const getStatusStyle = (status: string) => {
    if (status === 'Online') {
      return { color: 'green', fontWeight: 'bold' };
    } else if (status === 'Offline') {
      return { color: 'red', fontWeight: 'bold' };
    } else {
      return { color: 'gray', fontWeight: 'bold' }; 
    }
  };

  const getMarkerIcon = (status: string) => {
    let iconUrl;
    
    if (status === 'Online') {
      iconUrl = '/assets/green-pin.png';
    } else if (status === 'Offline') {
      iconUrl = '/assets/red-pin.png';
    } else {
      // For 'Checking...' and other states
      iconUrl = '/assets/silver-pin.png';
    }
    
    return L.icon({
      iconUrl: iconUrl,
      iconSize: [31.25, 40],
      iconAnchor: [15.625, 40], // Center horizontally, bottom of the icon
      popupAnchor: [0, -40], // Center horizontally, above the icon
    });
  };

  const getCircleColor = (status: string) => {
    if (status === 'Online') {
      return 'green';
    } else if (status === 'Offline') {
      return 'red';
    } else {
      // For 'Checking...' and other states
      return 'gray';
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>เครื่องมือตรวจสอบสถานะ IP</h1>
        <div className="controls">
          <button onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
          <button onClick={() => setAutoRefresh(prev => !prev)}>
            {autoRefresh ? 'ปิด Auto Refresh' : 'เปิด Auto Refresh'}
          </button>
          {lastUpdate && (
            <span className="last-update">
              อัปเดตล่าสุด: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <div className="content-container">
        <div className="map-container">
          <MapContainer 
            center={locations[0].position} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | แผนที่จาก OpenStreetMap'
            />

            {locations.map((location, index) => {
              const status = ipStatuses[location.ip] || 'Checking...';
              const circleColor = getCircleColor(status);
              
              return (
                <React.Fragment key={index}>
                  <Marker position={location.position} icon={getMarkerIcon(status)}>
                    <Popup>
                      <div className="popup-content">
                        <h3>{location.name}</h3>
                        <p>IP: {location.ip}</p>
                        <p style={getStatusStyle(status)}>สถานะ: {status}</p>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={location.position}
                    radius={300}
                    pathOptions={{
                      color: circleColor,
                      fillColor: circleColor,
                      fillOpacity: 0.2
                    }}
                  />
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>

        <div className="status-list">
          <h2>IP Addresses Status:</h2>
          <div className="status-grid">
            {ipList.map((ip, index) => {
              const status = ipStatuses[ip] || 'Checking...';
              const locationInfo = locations.find(loc => loc.ip === ip);
              
              return (
                <div key={index} className={`status-item ${status.toLowerCase()}`}>
                  <div className="status-indicator" />
                  <div className="status-details">
                    <h3>{ip}</h3>
                    {locationInfo && <p>{locationInfo.name}</p>}
                    <p style={getStatusStyle(status)}>{status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;