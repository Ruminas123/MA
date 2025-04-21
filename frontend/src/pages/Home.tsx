import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import './Home.css';


export function Home() {
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

  function MapRecenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
      map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
  }

  const greenIcon = new L.Icon({
    iconUrl: '/ma-app/assets/green-pin.png',  // Corrected icon path
    iconSize: [14, 21],
    iconAnchor: [12.5, 32],
    popupAnchor: [0, -32],
  });

  const redIcon = new L.Icon({
    iconUrl: '/ma-app/assets/red-pin.png',  // Corrected icon path
    iconSize: [14, 21],
    iconAnchor: [12.5, 32],
    popupAnchor: [0, -32],
  });

  const silverIcon = new L.Icon({
    iconUrl: '/ma-app/assets/silver-pin.png',  // Corrected icon path
    iconSize: [14, 21],
    iconAnchor: [12.5, 32],
    popupAnchor: [0, -32],
  });

  const StatusIndicator = React.memo(({ status }: { status: string }) => {
    const style = useMemo(() => getStatusStyle(status), [status]);
    return <span style={style}>{status}</span>;
  });

  function getStatusStyle(status: string) {
    if (status === 'Online') {
      return { color: '#4CAF50', fontWeight: 'bold' };
    } else if (status === 'Offline') {
      return { color: '#F44336', fontWeight: 'bold' };
    } else {
      return { color: '#9E9E9E', fontWeight: 'bold' };
    }
  }

  const [ipStatuses, setIpStatuses] = useState<IpStatus>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.7367, 100.5231]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const api = useMemo(() => axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  }), []);

  useEffect(() => {
    let timer: number | null = null;
    if (isLoading || isRefreshing) {
      setElapsedTime(0);
      timer = window.setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    }
    return () => {
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  }, [isLoading, isRefreshing]);

  const fetchLocations = useCallback(async (abortSignal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api.post('/api/ip/check-ips', {}, { signal: abortSignal });
      console.log('response :>> ', response.data);
      if (response.data) {
        const locationData: Location[] = [];
        // const results = response.data;
        const results = response.data.results;

        Object.keys(results).forEach(ip => {
          const data = results[ip];
          if (data && data.latitude && data.longitude) {
            locationData.push({
              ip,
              id: data.id,
              name: data.name || 'Unknown',
              position: [parseFloat(data.latitude), parseFloat(data.longitude)],
              latitude: parseFloat(data.latitude),
              longitude: parseFloat(data.longitude),
              status: data.status || 'Unknown',
            });
          }
        });

        setLocations(locationData.sort((a, b) => a.id - b.id));
        setIpStatuses(results);
        setLastUpdate(new Date());

        if (locationData.length > 0) {
          setMapCenter(locationData[0].position);
        }
      }
    } catch (requestError: any) {
      if (axios.isCancel(requestError)) {
        return;
      } else {
        setError('There was an error fetching data.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [api]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setLocations(prevLocations =>
      prevLocations.map(location => ({
        ...location,
        status: 'Checking...'
      }))
    );
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLocations(controller.signal);
    return () => {
      controller.abort('Component unmounted');
    };
  }, [fetchLocations]);

  const getMarkerIcon = useCallback((status: string, isRefreshing: boolean) => {
    if (isRefreshing) return silverIcon;
    return status === 'Online' ? greenIcon : status === 'Offline' ? redIcon : silverIcon;
  }, []);

  const mapMarkers = useMemo(() => {
    return locations.map((location, index) => {
      const ipData = ipStatuses[location.ip];
      const status = ipData?.status || 'Checking...';

      return (
        <Marker
          key={`location-${location.ip}-${index}`}
          position={location.position}
          icon={getMarkerIcon(status, isRefreshing)}
        >
          <Popup>
            <div className="popup-content">
              <h3>{location.name}</h3>
              <p>IP: {location.ip}</p>
              <p style={getStatusStyle(isRefreshing ? 'Checking...' : status)}>
                สถานะ: {isRefreshing ? 'Checking...' : status}
              </p>
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [locations, ipStatuses, isRefreshing, getMarkerIcon]);

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
          </div>
        </div>
      );
    });
  }, [locations, ipStatuses, isRefreshing]);

  const loadingMessage = useMemo(() => {
    if (isLoading || isRefreshing) {
      return `กำลังโหลด... (${elapsedTime} วินาที)`;
    }
    return 'รีเฟรช';
  }, [isLoading, isRefreshing, elapsedTime]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>เครื่องมือตรวจสอบสถานะ IP</h1>
        <div className="controls">
          <button onClick={handleRefresh} disabled={isLoading || isRefreshing}>
            {loadingMessage}
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
        <div className="map-container" style={{ height: '500px' }}>
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

export default Home;
