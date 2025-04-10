import React, { useState, useEffect } from 'react';

export function Login() {
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    console.log('isLoading :>> ', isLoading);
  }, [isLoading]);

  return (
    <div>
      <h2>Home</h2>
      {isLoading ? <p>Loading...</p> : <p>Content Loaded</p>}
    </div>
  );
}
