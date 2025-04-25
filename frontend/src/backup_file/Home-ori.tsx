import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import '../css/Home.css';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

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

  const LoadingPage = () => (
    <section id='Home'>
      <div className="loading-screen">
        <div className="spinner" />
        <p>กำลังโหลดแผนที่และข้อมูล IP...</p>
      </div>
    </section>
  );

  function MapRecenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
      map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
  }

  const greenIcon = new L.Icon({ iconUrl: '/ma-app/assets/green-pin.png', iconSize: [14, 21], iconAnchor: [12.5, 32], popupAnchor: [0, -32] });
  const redIcon = new L.Icon({ iconUrl: '/ma-app/assets/red-pin.png', iconSize: [14, 21], iconAnchor: [12.5, 32], popupAnchor: [0, -32] });
  const silverIcon = new L.Icon({ iconUrl: '/ma-app/assets/silver-pin.png', iconSize: [14, 21], iconAnchor: [12.5, 32], popupAnchor: [0, -32] });

  const getStatusStyle = (status: string) => {
    if (status === 'Online') return { color: '#4CAF50', fontWeight: 'bold' };
    if (status === 'Offline') return { color: '#F44336', fontWeight: 'bold' };
    return { color: '#9E9E9E', fontWeight: 'bold' };
  };

  const [ipStatuses, setIpStatuses] = useState<IpStatus>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.757936, 100.441008]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const locationIndexRef = useRef({ byIp: new Map(), byName: new Map(), byCoordinates: new Map() });

  useEffect(() => {
    const byIp = new Map();
    const byName = new Map();
    const byCoordinates = new Map();

    locations.forEach((location, idx) => {
      location.ip.toLowerCase().split('.').forEach(word => {
        if (!byIp.has(word)) byIp.set(word, new Set());
        byIp.get(word).add(idx);
      });

      location.name.toLowerCase().split(/\s+/).forEach(word => {
        if (!byName.has(word)) byName.set(word, new Set());
        byName.get(word).add(idx);
      });

      const latStr = location.latitude.toFixed(2);
      const lngStr = location.longitude.toFixed(2);

      if (!byCoordinates.has(latStr)) byCoordinates.set(latStr, new Set());
      byCoordinates.get(latStr).add(idx);
      if (!byCoordinates.has(lngStr)) byCoordinates.set(lngStr, new Set());
      byCoordinates.get(lngStr).add(idx);
    });

    locationIndexRef.current = { byIp, byName, byCoordinates };
  }, [locations]);

  useEffect(() => {
    let timer: number | null = null;
    if (isLoading || isRefreshing) {
      setElapsedTime(0);
      timer = window.setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    }
    return () => {
      if (timer !== null) clearInterval(timer);
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
              longitude: lng,
            };
          }
        });

        setLocations(locationData.sort((a, b) => a.id - b.id));
        setIpStatuses(ipStatusMap);
        setLastUpdate(new Date());
        setCurrentPage(1);
      }
    } catch (requestError: any) {
      if (!axios.isCancel(requestError)) setError('There was an error fetching data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchLocations(controller.signal);
    return () => controller.abort('Component unmounted');
  }, [fetchLocations]);

  const getMarkerIcon = useCallback((status: string, isRefreshing: boolean) => {
    if (isRefreshing) return silverIcon;
    return status === 'Online' ? greenIcon : status === 'Offline' ? redIcon : silverIcon;
  }, []);

  const filteredLocations = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return locations;

    const term = debouncedSearchTerm.toLowerCase().trim();
    const termParts = term.split(/[\s.,]+/);
    if (termParts.length === 0) return locations;

    const matchedIndices = new Set<number>();
    let isFirstTerm = true;

    termParts.forEach(part => {
      if (part.length === 0) return;

      const currentMatches = new Set<number>();

      locationIndexRef.current.byIp.forEach((indices, key) => {
        if (key.includes(part)) indices.forEach(idx => currentMatches.add(idx));
      });

      locationIndexRef.current.byName.forEach((indices, key) => {
        if (key.includes(part)) indices.forEach(idx => currentMatches.add(idx));
      });

      locationIndexRef.current.byCoordinates.forEach((indices, key) => {
        if (key.includes(part)) indices.forEach(idx => currentMatches.add(idx));
      });

      if (isFirstTerm) {
        currentMatches.forEach(idx => matchedIndices.add(idx));
        isFirstTerm = false;
      } else {
        const newMatches = new Set<number>();
        matchedIndices.forEach(idx => {
          if (currentMatches.has(idx)) newMatches.add(idx);
        });
        matchedIndices.clear();
        newMatches.forEach(idx => matchedIndices.add(idx));
      }
    });

    if (matchedIndices.size === 0) {
      return locations.filter(location =>
        location.ip.toLowerCase().includes(term) ||
        location.name.toLowerCase().includes(term) ||
        location.latitude.toString().includes(term) ||
        location.longitude.toString().includes(term)
      );
    }

    return Array.from(matchedIndices).map(idx => locations[idx]);
  }, [locations, debouncedSearchTerm]);

  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);

  const paginatedLocations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLocations.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLocations, currentPage]);

  const mapMarkers = useMemo(() => {
    return filteredLocations.map((location, index) => {
      const ipData = ipStatuses[location.ip];
      const status = ipData?.status || 'Checking...';

      return (
        <Marker
          key={`location-${location.ip}-${index}`}
          position={location.position}
          icon={getMarkerIcon(status, isRefreshing)}
          eventHandlers={{
            mouseover: e => e.target.openPopup(),
            mouseout: e => e.target.closePopup(),
          }}
        >
          <Popup>
            <div className="popup-content">
              <h3>{location.name}</h3>
              <p>IP: {location.ip}</p>
              <p>Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
              <p>Status: <span style={getStatusStyle(status)}>{status}</span></p>
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [filteredLocations, ipStatuses, isRefreshing, getMarkerIcon, getStatusStyle]);

  useEffect(() => {
    if (debouncedSearchTerm.trim() && filteredLocations.length > 0) {
      setMapCenter(filteredLocations[0].position);
    }
  }, [filteredLocations, debouncedSearchTerm]);

  const statusList = useMemo(() => {
    return paginatedLocations.map((location, index) => {
      const ipData = ipStatuses[location.ip];
      const status = ipData?.status || 'Checking...';
      const displayStatus = isRefreshing ? 'Checking...' : status;

      return (
        <div key={`status-${location.ip}-${index}`} className={`status-item ${displayStatus.toLowerCase()}`} onClick={() => setMapCenter(location.position)}>
          <div className="status-indicator" />
          <div className="status-details">
            <h3>{location.ip}</h3>
            <p>{location.name}</p>
            <p className="coordinates">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
          </div>
        </div>
      );
    });
  }, [paginatedLocations, ipStatuses, isRefreshing]);

  const getAdjustedDate = () => {
    const now = new Date();
    const eighteen = new Date();
    eighteen.setHours(18, 0, 0, 0);
    if (now < eighteen) now.setDate(now.getDate() - 1);
    return now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handlePageChange = newPage => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="pagination">
        <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="pagination-button">&laquo; ก่อนหน้า</button>
        <span className="pagination-info">หน้า {currentPage} จาก {totalPages}</span>
        <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="pagination-button">ถัดไป &raquo;</button>
      </div>
    );
  };

  if (isLoading) return <LoadingPage />;

  return (
    <section id='Home'>
      <div className="app-container">
        <header className="app-header">
          <h1>เครื่องมือตรวจสอบสถานะ IP</h1>
          <div className="controls">
            <span className="last-update">อัปเดตล่าสุด: {getAdjustedDate()} เวลา 18:00:00 น.</span>
            <button style={{ background: 'red' }} onClick={logout}>Logout</button>
          </div>
        </header>

        {error && <div className="error-message">{error}</div>}

        <div className="content-container">
          <div className="map-container">
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' maxZoom={18} minZoom={5} />
              <MapRecenter center={mapCenter} />
              {mapMarkers}
            </MapContainer>
          </div>

          <div className="status-list">
            <h2>IP Addresses Status:</h2>
            <input type="text" placeholder="ค้นหา" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
            <div className="status-info">{filteredLocations.length} IP address found</div>
            <div className="status-grid">{statusList}</div>
            {renderPagination()}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Home;