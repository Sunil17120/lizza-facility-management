# Use Python 3.10 to satisfy zxing-cpp requirements
FROM python:3.10

# Install system-level build tools required for C++ compilation
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    make \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy the requirements file and install dependencies
COPY --chown=user requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY --chown=user . /app

EXPOSE 7860

# Command to run the FastAPI application
CMD ["gunicorn", "index:app", "-w", "5", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:7860"]