import { useState, useEffect } from "react";

const defaultSaws = [
  { id: 1, name: "Husqvarna 51", status: "Available", deposit: 175, rateDay: 55 },
  { id: 2, name: "Husqvarna 350", status: "Available", deposit: 175, rateDay: 55 },
  { id: 3, name: "Husqvarna 141", status: "Available", deposit: 125, rateDay: 45 },
  { id: 4, name: "Husqvarna 23 Compact", status: "Available", deposit: 100, rateDay: 40 },
  { id: 5, name: "McCulloch Pro Mac 610", status: "Available", deposit: 225, rateDay: 70 },
  { id: 6, name: "Poulan Wild Thing", status: "Available", deposit: 100, rateDay: 45 },
];

export default function App() {
  const [saws, setSaws] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [pin, setPin] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const savedSaws = localStorage.getItem("saws");
    const savedBookings = localStorage.getItem("bookings");

    if (savedSaws) setSaws(JSON.parse(savedSaws));
    else {
      setSaws(defaultSaws);
      localStorage.setItem("saws", JSON.stringify(defaultSaws));
    }

    if (savedBookings) setBookings(JSON.parse(savedBookings));
  }, []);

  useEffect(() => {
    localStorage.setItem("saws", JSON.stringify(saws));
    localStorage.setItem("bookings", JSON.stringify(bookings));
  }, [saws, bookings]);

  function login() {
    if (pin === "1234") setAdmin(true);
    else alert("Wrong PIN");
  }

  function bookSaw(saw) {
    if (!customer || !phone) {
      alert("Enter customer info");
      return;
    }

    const newBooking = {
      id: Date.now(),
      saw: saw.name,
      customer,
      phone,
      status: "Out",
    };

    setBookings([...bookings, newBooking]);

    setSaws(
      saws.map((s) =>
        s.id === saw.id ? { ...s, status: "Out" } : s
      )
    );
  }

  function returnSaw(booking) {
    setBookings(
      bookings.map((b) =>
        b.id === booking.id ? { ...b, status: "Returned" } : b
      )
    );

    setSaws(
      saws.map((s) =>
        s.name === booking.saw ? { ...s, status: "Available" } : s
      )
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Saw Rent</h1>
      <p>136 Grand Ave, La Porte, IN</p>
      <p>219-851-9675</p>

      {!admin && (
        <div>
          <h2>Admin Login</h2>
          <input
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button onClick={login}>Login</button>
        </div>
      )}

      {admin && (
        <>
          <h2>Inventory</h2>
          {saws.map((saw) => (
            <div key={saw.id} style={{ border: "1px solid #ccc", padding: 10, margin: 5 }}>
              <h3>{saw.name}</h3>
              <p>Status: {saw.status}</p>
              <p>Deposit: ${saw.deposit}</p>
              <p>Day Rate: ${saw.rateDay}</p>

              {saw.status === "Available" && (
                <>
                  <input
                    placeholder="Customer Name"
                    onChange={(e) => setCustomer(e.target.value)}
                  />
                  <input
                    placeholder="Phone"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <button onClick={() => bookSaw(saw)}>Rent Out</button>
                </>
              )}
            </div>
          ))}

          <h2>Active Rentals</h2>
          {bookings
            .filter((b) => b.status === "Out")
            .map((booking) => (
              <div key={booking.id} style={{ border: "1px solid red", padding: 10, margin: 5 }}>
                <p>{booking.saw}</p>
                <p>{booking.customer}</p>
                <p>{booking.phone}</p>
                <button onClick={() => returnSaw(booking)}>Returned</button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}