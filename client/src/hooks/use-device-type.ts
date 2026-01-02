import { useState, useEffect } from "react";

export type DeviceType = 'desktop' | 'smartphone';
export type OrientationType = 'portrait' | 'landscape';

interface DeviceInfo {
  deviceType: DeviceType;
  orientation: OrientationType;
  isMobile: boolean;
  isVerticalPhone: boolean;
}

export function useDeviceType(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') {
      return { deviceType: 'desktop', orientation: 'landscape', isMobile: false, isVerticalPhone: false };
    }
    return detectDevice();
  });

  useEffect(() => {
    const handleResize = () => {
      setDeviceInfo(detectDevice());
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        setDeviceInfo(detectDevice());
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return deviceInfo;
}

function detectDevice(): DeviceInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const orientation: OrientationType = height > width ? 'portrait' : 'landscape';
  
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = width < 768;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  const isMobile = (isTouchDevice && isSmallScreen) || isMobileUA;
  const deviceType: DeviceType = isMobile ? 'smartphone' : 'desktop';
  const isVerticalPhone = isMobile && orientation === 'portrait';

  console.log('[DeviceType] Detection:', { 
    width, 
    height, 
    orientation, 
    isTouchDevice, 
    isSmallScreen, 
    isMobileUA, 
    deviceType,
    isVerticalPhone
  });

  return { deviceType, orientation, isMobile, isVerticalPhone };
}
