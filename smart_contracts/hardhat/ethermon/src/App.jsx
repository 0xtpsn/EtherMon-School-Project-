import { Web3Provider } from './context/Web3Context';
import { Navbar } from './components/Navbar';
import { Home } from './Home';
import { Mint } from './pages/Mint';
import { Marketplace } from './pages/Marketplace';
import { Collection } from './pages/Collection';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export default function App() {
    return (
        <BrowserRouter>
            <Web3Provider>
                <Navbar />
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/mint" element={<Mint />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/collection" element={<Collection />} />
                </Routes>
            </Web3Provider>
        </BrowserRouter>
    )
}