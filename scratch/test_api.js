
import axios from 'axios';

const test = async () => {
  try {
    const res = await axios.post('http://localhost:5000/api/v1/food/restaurant/pay-dues/order', {}, {
      headers: {
        // I don't have a token here, but I just want to see if the route exists
      }
    });
    console.log(res.data);
  } catch (err) {
    console.log(err.response?.status, err.response?.data);
  }
};

test();
