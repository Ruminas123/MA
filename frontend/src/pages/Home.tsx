import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios'; // ยังจำเป็นสำหรับ axios.isCancel
import '../css//Home.css';
import api from '../utils/api'; // ใช้ api จากไฟล์นี้แทน
import { useAuth } from '../contexts/AuthContext';

export function Home() {
  const { user, logout } = useAuth();

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

  const LoadingPage = () => {
    return (
      <section id='Home'>
        <div className="loading-screen">
          <div className="spinner" />
          <p>กำลังโหลดแผนที่และข้อมูล IP...</p>
        </div>
      </section>
    );
  };

  function MapRecenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
      map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
  }

  const greenIcon = new L.Icon({
    iconUrl: '/ma-app/assets/green-pin.png',
    iconSize: [14, 21],
    iconAnchor: [12.5, 32],
    popupAnchor: [0, -32],
  });

  const redIcon = new L.Icon({
    iconUrl: '/ma-app/assets/red-pin.png',
    iconSize: [14, 21],
    iconAnchor: [12.5, 32],
    popupAnchor: [0, -32],
  });

  const silverIcon = new L.Icon({
    iconUrl: '/ma-app/assets/silver-pin.png',
    iconSize: [14, 21],
    iconAnchor: [12.5, 32],
    popupAnchor: [0, -32],
  });

  const StatusIndicator = React.memo(({ status }: { status: string }) => {
    const style = useMemo(() => getStatusStyle(status), [status]);
    return <span style={style}>{status}</span>;
  });

  function getStatusStyle(status: string) {
    if (status === 'Online') {return { color: '#4CAF50', fontWeight: 'bold' }} 
    else if (status === 'Offline') {return { color: '#F44336', fontWeight: 'bold' }} 
    else {return { color: '#9E9E9E', fontWeight: 'bold' }}
  }

  const [ipStatuses, setIpStatuses] = useState<IpStatus>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.757936, 100.441008]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);


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

      const response = await api.post('/api/ip/get-ips', {}, { signal: abortSignal });
      const results = response.data.results;

      if (results) {
        const locationData: Location[] = [];
        const ipStatusMap: IpStatus = {};

        results.forEach((data: any) => {
          if (data && data.internet_protocol_latitude && data.internet_protocol_longtitude && data.internet_protocol_ip) {
            const lat = parseFloat(data.internet_protocol_latitude);
            const lng = parseFloat(data.internet_protocol_longtitude);
            const ip = data.internet_protocol_ip;

            locationData.push({
              ip,
              id: data.internet_protocol_id,
              name: data.internet_protocol_location || 'Unknown',
              position: [lat, lng],
              latitude: lat,
              longitude: lng,
              status: data.internet_protocol_status || 'Unknown',
            });

            ipStatusMap[ip] = {
              status: data.internet_protocol_status || 'Unknown',
              latitude: lat,
              longitude: lng
            };
          }
        });

        setLocations(locationData.sort((a, b) => a.id - b.id));
        setIpStatuses(ipStatusMap);
        setLastUpdate(new Date());
      }
    } catch (requestError: any) {
      if (!axios.isCancel(requestError)) {
        setError('There was an error fetching data.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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
              {/* <p style={getStatusStyle(isRefreshing ? 'Checking...' : status)}>
                สถานะ: {isRefreshing ? 'Checking...' : status}
              </p> */}
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
            {/* <StatusIndicator status={displayStatus} /> */}
          </div>
        </div>
      );
    });
  }, [locations, ipStatuses, isRefreshing]);

  // const handleRefresh = useCallback(() => {
  //   setIsRefreshing(true);
  //   setLocations(prevLocations =>
  //     prevLocations.map(location => ({
  //       ...location,
  //       status: 'Checking...'
  //     }))
  //   );
  //   fetchLocations();
  // }, [fetchLocations]);

  const getAdjustedDate = () => {
    const now = new Date();
    const eighteen = new Date();
    eighteen.setHours(18, 0, 0, 0);
  
    if (now < eighteen) { now.setDate(now.getDate() - 1) }
  
    return now.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading) { return <LoadingPage /> }

  return (
    <section id='Home'>
      <div className="app-container">
        <header className="app-header">
          <h1>เครื่องมือตรวจสอบสถานะ IP</h1>
          <div className="controls">
            <span className="last-update">
              อัปเดตล่าสุด: {getAdjustedDate()} เวลา 18:00:00 น.
            </span>
            {/* <button onClick={handleRefresh} disabled={isLoading || isRefreshing}>refresh</button> */}
            <button style={{ background: 'red' }} onClick={logout}>Logout</button>
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
    </section>
  );
}

export default Home;