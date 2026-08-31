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
    project?: string; // เพิ่ม project property
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
    project: string; // เพิ่ม project property
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
  const [projects, setProjects] = useState<string[]>([]); // เพิ่มตัวแปรสำหรับเก็บรายการ project ทั้งหมด
  const [selectedProject, setSelectedProject] = useState<string>('all'); // เพิ่มตัวแปรสำหรับเก็บค่า project ที่เลือก
  const itemsPerPage = 50;

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const locationIndexRef = useRef({ byIp: new Map(), byName: new Map(), byCoordinates: new Map(), byProject: new Map() });

  useEffect(() => {
    const byIp = new Map();
    const byName = new Map();
    const byCoordinates = new Map();
    const byProject = new Map(); // เพิ่ม index สำหรับ project

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

      // เพิ่มการจัดเก็บ index ตาม project
      if (location.project) {
        if (!byProject.has(location.project)) byProject.set(location.project, new Set());
        byProject.get(location.project).add(idx);
      }
    });

    locationIndexRef.current = { byIp, byName, byCoordinates, byProject };
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
        const projectsSet = new Set<string>();

        results.forEach((data: any) => {
          if (data && data.internet_protocol_latitude && data.internet_protocol_longtitude && data.internet_protocol_ip) {
            const lat = parseFloat(data.internet_protocol_latitude);
            const lng = parseFloat(data.internet_protocol_longtitude);
            const ip = data.internet_protocol_ip;
            const project = data.internet_protocol_project || 'ไม่ระบุโครงการ'; // เพิ่มการเก็บค่า project

            // เก็บ project ทั้งหมดใน Set เพื่อกำจัดค่าซ้ำ
            projectsSet.add(project);

            locationData.push({
              ip,
              id: data.internet_protocol_id,
              name: data.internet_protocol_location || 'Unknown',
              position: [lat, lng],
              latitude: lat,
              longitude: lng,
              status: data.internet_protocol_status || 'Unknown',
              project: project,
            });

            ipStatusMap[ip] = {
              status: data.internet_protocol_status || 'Unknown',
              latitude: lat,
              longitude: lng,
              project: project,
            };
          }
        });

        setLocations(locationData.sort((a, b) => a.id - b.id));
        setIpStatuses(ipStatusMap);
        setLastUpdate(new Date());
        setCurrentPage(1);
        
        // เพิ่มการเซ็ต projects จาก Set ที่เก็บรวบรวมมา
        setProjects(Array.from(projectsSet).sort());
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

  // ปรับปรุงฟังก์ชัน filteredLocations ให้กรองตาม project ที่เลือกด้วย
  const filteredLocations = useMemo(() => {
    // กรองโดย project ก่อน
    let projectFiltered = locations;
    if (selectedProject !== 'all') {
      projectFiltered = locations.filter(location => location.project === selectedProject);
    }

    // ถ้าไม่มีคำค้นหา ส่งคืนรายการที่กรองตาม project
    if (!debouncedSearchTerm.trim()) return projectFiltered;

    const term = debouncedSearchTerm.toLowerCase().trim();
    const termParts = term.split(/[\s.,]+/);
    if (termParts.length === 0) return projectFiltered;

    // ตรงนี้ต้องปรับให้ search จาก projectFiltered แทน locations
    const matchedIndices = new Set<number>();
    let isFirstTerm = true;

    // สร้าง map ใหม่เพื่อเก็บ index ของ projectFiltered
    const filteredIndexMap = new Map<number, number>();
    projectFiltered.forEach((loc, idx) => {
      const originalIdx = locations.findIndex(l => l.id === loc.id);
      if (originalIdx >= 0) {
        filteredIndexMap.set(originalIdx, idx);
      }
    });

    termParts.forEach(part => {
      if (part.length === 0) return;

      const currentMatches = new Set<number>();

      locationIndexRef.current.byIp.forEach((indices, key) => {
        if (key.includes(part)) {
          indices.forEach(idx => {
            if (filteredIndexMap.has(idx)) {
              currentMatches.add(filteredIndexMap.get(idx));
            }
          });
        }
      });

      locationIndexRef.current.byName.forEach((indices, key) => {
        if (key.includes(part)) {
          indices.forEach(idx => {
            if (filteredIndexMap.has(idx)) {
              currentMatches.add(filteredIndexMap.get(idx));
            }
          });
        }
      });

      locationIndexRef.current.byCoordinates.forEach((indices, key) => {
        if (key.includes(part)) {
          indices.forEach(idx => {
            if (filteredIndexMap.has(idx)) {
              currentMatches.add(filteredIndexMap.get(idx));
            }
          });
        }
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
      return projectFiltered.filter(location =>
        location.ip.toLowerCase().includes(term) ||
        location.name.toLowerCase().includes(term) ||
        location.latitude.toString().includes(term) ||
        location.longitude.toString().includes(term)
      );
    }

    return Array.from(matchedIndices).map(idx => projectFiltered[idx]);
  }, [locations, debouncedSearchTerm, selectedProject]);

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
              <p>โครงการ: {location.project}</p>
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
        <div 
          key={`status-${location.ip}-${index}`} 
          className={`status-item ${displayStatus.toLowerCase()}`} 
          onClick={() => setMapCenter(location.position)}
        >
          <div className="status-indicator" />
          <div className="status-details">
            <h3>{location.ip}</h3>
            <p>{location.name}</p>
            <p className="project">{location.project}</p>
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

  const handleProjectChange = (e) => {
    setSelectedProject(e.target.value);
    setCurrentPage(1); // รีเซ็ตหน้าเมื่อเปลี่ยนโครงการ
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

  // สร้าง Radio Group สำหรับกรองตาม project
  const renderProjectFilter = () => {
    return (
      <div className="project-filter">
        <h3>กรองตามโครงการ:</h3>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              name="project"
              value="all"
              checked={selectedProject === 'all'}
              onChange={handleProjectChange}
            />
            <span>ทั้งหมด ({locations.length})</span>
          </label>
          
          {/* สร้าง radio button สำหรับแต่ละ project */}
          {projects.map(project => {
            const count = locations.filter(location => location.project === project).length;
            return (
              <label key={project} className="radio-label">
                <input
                  type="radio"
                  name="project"
                  value={project}
                  checked={selectedProject === project}
                  onChange={handleProjectChange}
                />
                <span>{project} ({count})</span>
              </label>
            );
          })}
        </div>
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
            <span className="last-update">อัปเดตล่าสุด: {getAdjustedDate()} เวลา 17:00:00 น.</span>
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
            
            {/* เพิ่ม Radio Group สำหรับกรองตาม project */}
            {renderProjectFilter()}
            
            <input 
              type="text" 
              placeholder="ค้นหา IP, ชื่อสถานที่ หรือพิกัด" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="search-input" 
            />
            
            <div className="status-info">
              {filteredLocations.length} IP address found
              {selectedProject !== 'all' && ` ในโครงการ "${selectedProject}"`}
            </div>
            
            <div className="status-grid">{statusList}</div>
            {renderPagination()}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Home;