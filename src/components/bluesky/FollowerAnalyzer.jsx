import React, { useState, useEffect } from 'react';
import { BskyAgent } from '@atproto/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, Lock, ExternalLink } from 'lucide-react';
import html2canvas from 'html2canvas';

const agent = new BskyAgent({ service: 'https://bsky.social' });

const FollowerAnalyzer = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [loggedInHandle, setLoggedInHandle] = useState('');

  useEffect(() => {
    const restoreSession = async () => {
      const session = localStorage.getItem('bsky_session');
      if (session) {
        try {
          const sessionData = JSON.parse(session);
          await agent.resumeSession(sessionData);
          setIsAuthenticated(true);
          setLoggedInHandle(sessionData.handle);
          fetchFollowerData(sessionData.handle);
        } catch (err) {
          console.error('Failed to restore session:', err);
          localStorage.removeItem('bsky_session');
        }
      }
    };

    restoreSession();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await agent.login({ identifier: username, password });
      const sessionData = {
        email: response.data.email,
        did: response.data.did,
        handle: response.data.handle,
        accessJwt: response.data.accessJwt,
        refreshJwt: response.data.refreshJwt,
      };
      localStorage.setItem('bsky_session', JSON.stringify(sessionData));
      setIsAuthenticated(true);
      setLoggedInHandle(response.data.handle);
      setLoading(true);
      setError('');
      fetchFollowerData(response.data.handle);
    } catch (err) {
      setError('Login failed. Please check your credentials.');
      console.error('Login error:', err);
    }
  };

  const fetchFollowerData = async (handle) => {
    setLoading(true);
    setError('');
    setProgress({ current: 0, total: 0 });
    
    try {
      const profile = await agent.getProfile({ actor: handle });
      let allFollowers = [];
      let cursor;
      
      do {
        const response = await agent.getFollowers({
          actor: profile.data.did,
          limit: 100,
          cursor,
        });
        
        allFollowers = [...allFollowers, ...response.data.followers];
        setProgress({ 
          current: allFollowers.length, 
          total: profile.data.followersCount,
          phase: 'Collecting followers'
        });
        cursor = response.data.cursor;
      } while (cursor);

      const batchSize = 20;
      const followersWithCounts = [];
      
      for (let i = 0; i < allFollowers.length; i += batchSize) {
        const batch = allFollowers.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (follower) => {
            try {
              const profile = await agent.getProfile({ actor: follower.handle });
              return {
                ...follower,
                followerCount: profile.data.followersCount,
                avatar: profile.data.avatar,
                displayName: profile.data.displayName,
              };
            } catch (error) {
              console.error(`Error fetching profile for ${follower.handle}:`, error);
              return {
                ...follower,
                followerCount: 0,
                error: true,
              };
            }
          })
        );
        followersWithCounts.push(...batchResults);
        setProgress({ 
          current: i + batchSize, 
          total: allFollowers.length,
          phase: 'Getting follower counts'
        });
        
        await new Promise(resolve => setTimeout(resolve, 750));
      }

      const sortedFollowers = followersWithCounts
        .sort((a, b) => b.followerCount - a.followerCount);
      
      setFollowers(sortedFollowers);
    } catch (err) {
      setError(err.message || 'Failed to fetch follower data');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      await new Promise(r => setTimeout(r, 1000)); 
      // Capture the existing followers list
      const existingList = document.querySelector('.space-y-4');
      const canvas = await html2canvas(existingList, {
        useCORS: true,
        allowTaint: true,
      });
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      // Upload image to Bluesky
      const uploadResponse = await agent.uploadBlob(blob, {
        encoding: 'image/png'
      });

      const text = `My top 5 followers are ${followers.slice(0, 5).map(f => `@${f.handle}`).join(' ')} 👀\n\nFind yours at topblueskyfollowers.com\n\nMade by @rhyskentish.bsky.social`;

      // Create facets for mentions and link
      const facets = [];
      let currentPosition = 0;
  
      // Add mentions for top 5 followers
      for (const follower of followers.slice(0, 5)) {
        const handle = follower.handle;
        const mention = `@${handle}`;
        const mentionIndex = text.indexOf(mention, currentPosition);
        if (mentionIndex !== -1) {
          const byteStart = new TextEncoder().encode(text.slice(0, mentionIndex + 1)).length - 1;
          const byteEnd = byteStart + new TextEncoder().encode(mention).length;
          
          facets.push({
            index: {
              byteStart,
              byteEnd,
            },
            features: [{
              $type: 'app.bsky.richtext.facet#mention',
              did: follower.did
            }]
          });
          currentPosition = mentionIndex + mention.length;
        }
      }
  
      // Add mention for rhyskentish
      const creatorMention = '@rhyskentish.bsky.social';
      const creatorIndex = text.lastIndexOf(creatorMention);
      if (creatorIndex !== -1) {
        const byteStart = new TextEncoder().encode(text.slice(0, creatorIndex + 1)).length - 1;
        const byteEnd = byteStart + new TextEncoder().encode(creatorMention).length;
        
        const resolved = await agent.resolveHandle({ handle: 'rhyskentish.bsky.social' });
        
        facets.push({
          index: {
            byteStart,
            byteEnd,
          },
          features: [{
            $type: 'app.bsky.richtext.facet#mention',
            did: resolved.data.did
          }]
        });
      }
  
      // Add link facet
      const link = 'topblueskyfollowers.com';
      const linkIndex = text.indexOf(link);
      if (linkIndex !== -1) {
        const byteStart = new TextEncoder().encode(text.slice(0, linkIndex)).length;
        const byteEnd = byteStart + new TextEncoder().encode(link).length;
        
        facets.push({
          index: {
            byteStart,
            byteEnd,
          },
          features: [{
            $type: 'app.bsky.richtext.facet#link',
            uri: `https://${link}`
          }]
        });
      }

      // Create post with facets and image
      await agent.post({
        text,
        facets,
        embed: {
          $type: 'app.bsky.embed.images',
          images: [{
            alt: 'Top 5 most followed followers ranking',
            image: uploadResponse.data.blob
          }]
        }
      });

      alert('Posted successfully!');
    } catch (error) {
      console.error('Error sharing:', error);
      alert('Failed to share. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-6 w-6" />
            Login to Bluesky
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg text-sm space-y-2">
            <p>For security, please use an App Password instead of your main password:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to Bluesky Settings → App Passwords</li>
              <li>Click "Create app password"</li>
              <li>Name it (e.g. "Follower Analyzer")</li>
              <li>Copy & paste the generated password here</li>
            </ol>
            <a 
              href="https://bsky.app/settings/app-passwords"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Open App Passwords Settings <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          
          <div className="space-y-2">
            <Input
              placeholder="Your Bluesky handle or email"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace('@', ''))}
            />
            <Input
              type="password"
              placeholder="App Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button 
            onClick={handleLogin}
            disabled={loading || !username || !password}
            className="w-full"
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>
          {error && <div className="text-red-500 text-sm">{error}</div>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-6 w-6" />
          Your Follower Rankings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-2 text-center py-4">
            <div>Analyzing followers... This may take a few minutes.</div>
            {progress.total > 0 && (
              <div className="text-sm text-slate-600">
                {progress.phase}: {progress.current} / {progress.total}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-red-500 py-2 text-sm">{error}</div>
        )}

        {followers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                Top {Math.min(followers.length, 10)} of {followers.length} followers, ranked by their follower count:
              </h3>
              {!sharing &&<Button
                onClick={handleShare}
                className="flex items-center gap-2"
                variant="outline"
                disabled={loading || sharing}
              >
                {sharing ? 'Sharing...' : 'Share Results'}
                <ExternalLink className="w-4 h-4" />
              </Button>}
            </div>
            <div className="space-y-2">
              {followers.slice(0, 10).map((follower, index) => (
                <a
                  href={`https://bsky.app/profile/${follower.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={follower.did}
                  className="block"
                >
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-slate-600 w-8">#{index + 1}</span>
                      {follower.avatar ? (
                        <img 
                          src={`https://corsproxy.io/?${follower.avatar}`} 
                          alt={`${follower.handle}'s avatar`}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => {
                            e.target.src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile.png';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                          <Users className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {follower.displayName || follower.handle}
                        </span>
                        <span className="text-slate-600 text-sm">
                          {follower.handle}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-600">
                        {follower.followerCount.toLocaleString()} followers
                      </span>
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-center text-sm text-slate-500">
          <Button 
            onClick={() => {
              localStorage.removeItem('bsky_session');
              setIsAuthenticated(false);
              setUsername('');
              setPassword('');
              setFollowers([]);
              setLoggedInHandle('');
              setLoading(false)
            }}
            variant="link"
          >
            Logout
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FollowerAnalyzer;