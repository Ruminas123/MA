import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import './App.css';

// Define types
interface IpData {
  status: string;
  latitude: number;
  longitude: number;
}

interface IpStatus {
  [key: string]: IpData;
}

interface Location {
  position: [number, number];
  name: string;
  ip: string;
  id: number;
  latitude: number;
  longitude: number;
  status: string;
}

// Create a specialized component for map recenter
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

// Preload and optimize marker icons
const greenIcon = new L.Icon({
  iconUrl: '/assets/green-pin.png',
  iconSize: [25, 32], // Slightly reduced size for faster rendering
  iconAnchor: [12.5, 32],
  popupAnchor: [0, -32],
});

const redIcon = new L.Icon({
  iconUrl: '/assets/red-pin.png',
  iconSize: [25, 32],
  iconAnchor: [12.5, 32],
  popupAnchor: [0, -32],
});

const silverIcon = new L.Icon({
  iconUrl: '/assets/silver-pin.png',
  iconSize: [25, 32],
  iconAnchor: [12.5, 32],
  popupAnchor: [0, -32],
});

// Memoized status indicator for better performance
const StatusIndicator = React.memo(({ status }: { status: string }) => {
  const style = useMemo(() => getStatusStyle(status), [status]);
  return <span style={style}>{status}</span>;
});

console.log(import.meta.env.VITE_API_URL);


function App() {
  const [ipStatuses, setIpStatuses] = useState<IpStatus>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.7367, 100.5231]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Use axios instance with optimized settings
  const api = useMemo(() => axios.create({
    baseURL: 'http://localhost:3000',
    timeout: 30000, // Increased timeout from 10s to 30s
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  }), []);

  // Optimized fetch function with abort controller
  const fetchLocations = useCallback(async (abortSignal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use a try-catch specifically for the axios request
      try {
        const response = await api.post('/check-ips', {}, {
          signal: abortSignal
        });
        
        if (response.data && response.data.results) {
          // Optimize data processing with direct mapping
          const locationData: Location[] = [];
          const results = response.data.results;
          // Process data more efficiently
          Object.keys(results).forEach(ip => {
            const data = results[ip];
            if (data && data.latitude && data.longitude) {
              locationData.push({
                ip,
                id: data.id,
                name: data.name || 'Unknown',
                position: [parseFloat(data.latitude), parseFloat(data.longitude)] as [number, number],
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                status: data.status || 'Unknown',
              });
            }
          });
          setLocations(locationData.sort((a, b) => a.id - b.id));
          setIpStatuses(results);
          setLastUpdate(new Date());
          
          // Update map center if we have locations
          if (locationData.length > 0) {
            setMapCenter(locationData[0].position);
          }
        }
      } catch (requestError: any) {
        // Handle axios specific errors
        if (axios.isCancel(requestError)) {
          console.log('Request was canceled:', requestError.message);
          // Don't set error state for canceled requests
          return;
        } else {
          throw requestError; // Re-throw to be caught by the outer catch
        }
      }
    } catch (error: any) {
      // Only set error if component is still mounted and it's not an abort error
      if (error.name !== 'AbortError' && error.name !== 'CanceledError') {
        const message = error.message || 'Unknown error';
        setError(`Error fetching locations: ${message}`);
        console.error('Error fetching locations:', error);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [api]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    
    // Optimize status update by using functional updates
    setLocations(prevLocations => 
      prevLocations.map(location => ({
        ...location,
        status: 'Checking...'
      }))
    );
    
    fetchLocations();
  }, [fetchLocations]);

  // Fixed useEffect implementation that properly handles abort controller
  useEffect(() => {
    const controller = new AbortController();
    
    // Call fetchLocations with the abort signal
    fetchLocations(controller.signal);
    
    // Return a cleanup function
    return () => {
      controller.abort('Component unmounted');
    };
  }, [fetchLocations]);

  // Memoized marker icon selector
  const getMarkerIcon = useCallback((status: string, isRefreshing: boolean) => {
    if (isRefreshing) return silverIcon;
    return status === 'Online' ? greenIcon : status === 'Offline' ? redIcon : silverIcon;
  }, []);

  // Memoized circle color selector
  const getCircleColor = useCallback((status: string, isRefreshing: boolean) => {
    if (isRefreshing) return '#9E9E9E';
    return status === 'Online' ? '#4CAF50' : status === 'Offline' ? '#F44336' : '#9E9E9E';
  }, []);

  // Memoize locations for the map to prevent unnecessary re-renders
  const mapMarkers = useMemo(() => {
    return locations.map((location, index) => {
      const ipData = ipStatuses[location.ip];
      const status = ipData?.status || 'Checking...';
      const circleColor = getCircleColor(status, isRefreshing);

      return (
        <React.Fragment key={`location-${location.ip}-${index}`}>
          <Marker position={location.position} icon={getMarkerIcon(status, isRefreshing)}>
            <Popup>
              <div className="popup-content">
                <h3>{location.name}</h3>
                <p>IP: {location.ip}</p>
                <p style={getStatusStyle(isRefreshing ? 'Checking...' : status)}>
                  สถานะ: {isRefreshing ? 'Checking...' : status}
                </p>
                {/* {ipData?.status && (
                  <p>ในระบบ: {ipData.status === "Active" ? "เปิดใช้งาน" : "ไม่เปิดใช้งาน"}</p>
                )} */}
              </div>
            </Popup>
          </Marker>
          <Circle
            center={location.position}
            radius={300}
            pathOptions={{
              color: circleColor,
              fillColor: circleColor,
              fillOpacity: 0.2,
            }}
          />
        </React.Fragment>
      );
    });
  }, [locations, ipStatuses, isRefreshing, getMarkerIcon, getCircleColor]);

  // Memoize status list to prevent unnecessary re-renders
  const statusList = useMemo(() => {
    return locations.map((location, index) => {
      const ipData = ipStatuses[location.ip];
      const status = ipData?.status || 'Checking...';
      const displayStatus = isRefreshing ? 'Checking...' : status;

      return (
        <div key={`status-${location.ip}-${index}`} className={`status-item ${displayStatus.toLowerCase()}`}>
          <div className="status-indicator" />
          <div className="status-details">
            <h3>{location.ip}</h3>
            <p>{location.name}</p>
            <StatusIndicator status={displayStatus} />
            {/* {ipData?.status && (
              <p>ในระบบ: {ipData.status === "Active" ? "เปิดใช้งาน" : "ไม่เปิดใช้งาน"}</p>
            )} */}
          </div>
        </div>
      );
    });
  }, [locations, ipStatuses, isRefreshing]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>เครื่องมือตรวจสอบสถานะ IP</h1>
        <div className="controls">
          <button onClick={handleRefresh} disabled={isLoading || isRefreshing}>
            {isLoading ? 'กำลังโหลด...' : isRefreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
          </button>
          {lastUpdate && (
            <span className="last-update">
              อัปเดตล่าสุด: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="content-container">
        <div className="map-container">
          <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer 
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
              attribution='&copy; OpenStreetMap contributors'
              maxZoom={18}
              minZoom={5}
            />
            <MapRecenter center={mapCenter} />
            {mapMarkers}
          </MapContainer>
        </div>

        <div className="status-list">
          <h2>IP Addresses Status:</h2>
          <div className="status-grid">
            {statusList}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function for status styling
function getStatusStyle(status: string) {
  if (status === 'Online') {
    return { color: '#4CAF50', fontWeight: 'bold' };
  } else if (status === 'Offline') {
    return { color: '#F44336', fontWeight: 'bold' };
  } else {
    return { color: '#9E9E9E', fontWeight: 'bold' };
  }
}

export default App;