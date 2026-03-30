
const SIMULATED_LATENCY = 100; // ms
const REQUEST_COUNT = 10;

const mockApi = {
    post: async (endpoint, payload) => {
        await new Promise(resolve => setTimeout(resolve, SIMULATED_LATENCY));
        return { data: { success: true } };
    },
    put: async (endpoint, payload) => {
        await new Promise(resolve => setTimeout(resolve, SIMULATED_LATENCY));
        return { data: { success: true } };
    },
    delete: async (endpoint, payload) => {
        await new Promise(resolve => setTimeout(resolve, SIMULATED_LATENCY));
        return { data: { success: true } };
    }
};

const requests = Array.from({ length: REQUEST_COUNT }, (_, i) => ({
    id: i + 1,
    endpoint: '/test',
    payload: JSON.stringify({ data: i }),
    method: i % 3 === 0 ? 'POST' : (i % 3 === 1 ? 'PUT' : 'DELETE')
}));

async function runSequential() {
    const start = Date.now();
    const syncedRequestIds = [];
    let hasSyncedAny = false;

    for (const req of requests) {
        try {
            const payload = JSON.parse(req.payload);
            const method = req.method?.toLowerCase() || 'post';

            if (method === 'put') {
                await mockApi.put(req.endpoint, payload);
            } else if (method === 'delete') {
                await mockApi.delete(req.endpoint, { data: payload });
            } else {
                await mockApi.post(req.endpoint, payload);
            }

            syncedRequestIds.push(req.id);
            hasSyncedAny = true;
        } catch (err) {
            if (err.response) {
                syncedRequestIds.push(req.id);
                hasSyncedAny = true;
            }
        }
    }
    const end = Date.now();
    return end - start;
}

async function runParallel() {
    const start = Date.now();
    const syncedRequestIds = [];
    let hasSyncedAny = false;

    const results = await Promise.allSettled(requests.map(async (req) => {
        try {
            const payload = JSON.parse(req.payload);
            const method = req.method?.toLowerCase() || 'post';

            if (method === 'put') {
                await mockApi.put(req.endpoint, payload);
            } else if (method === 'delete') {
                await mockApi.delete(req.endpoint, { data: payload });
            } else {
                await mockApi.post(req.endpoint, payload);
            }

            return { id: req.id, synced: true };
        } catch (err) {
            if (err.response) {
                return { id: req.id, synced: true };
            }
            return { id: req.id, synced: false };
        }
    }));

    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.synced) {
            syncedRequestIds.push(result.value.id);
            hasSyncedAny = true;
        }
    });

    const end = Date.now();
    return end - start;
}

async function benchmark() {
    console.log(`Running benchmark with ${REQUEST_COUNT} requests and ${SIMULATED_LATENCY}ms latency each...`);

    const seqTime = await runSequential();
    console.log(`Sequential execution time: ${seqTime}ms`);

    const parTime = await runParallel();
    console.log(`Parallel execution time: ${parTime}ms`);

    const improvement = ((seqTime - parTime) / seqTime * 100).toFixed(2);
    console.log(`Improvement: ${improvement}%`);
}

benchmark();
